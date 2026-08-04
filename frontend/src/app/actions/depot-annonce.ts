"use server";

import { ApiError, type FieldErrors } from "@/lib/api";
import {
  creerBrouillon,
  getBrouillon,
  patchBrouillon,
  supprimerPhoto,
  uploaderPhotos,
  type CreerBrouillonInput,
} from "@/lib/annonces-api";
import type { AnnonceEcriture, AccesRoutier, Topographie } from "@/types/depot-annonce";
import type { AccesEau, StatutFoncier } from "@/types/parcelle";

export type DepotFormState = {
  annonce: AnnonceEcriture | null;
  error: string;
  fieldErrors: FieldErrors | null;
} | null;

// ParcelleEcritureSerializer est un sous-serializer imbriqué : DRF renvoie
// ses erreurs sous la forme {"parcelle": {"surface_ha": ["..."]}} — un objet,
// pas le tableau plat que FieldErrors suppose partout ailleurs (formulaires
// auth, tous à champs plats). On aplatit ici plutôt que de toucher le type
// partagé FieldErrors / lireErreur() dans lib/api.ts.
function aplatirErreursParcelle(fieldErrors: FieldErrors | null): FieldErrors | null {
  if (!fieldErrors) return fieldErrors;
  const parcelle = (fieldErrors as Record<string, unknown>).parcelle;
  if (!parcelle || Array.isArray(parcelle) || typeof parcelle !== "object") return fieldErrors;
  const messages = Object.values(parcelle as Record<string, string[]>).flat();
  return { ...fieldErrors, parcelle: messages };
}

function etatErreur(err: unknown): DepotFormState {
  if (err instanceof ApiError) {
    return { annonce: null, error: err.message, fieldErrors: aplatirErreursParcelle(err.fieldErrors) };
  }
  return { annonce: null, error: "Une erreur est survenue. Réessayez.", fieldErrors: null };
}

// Étape 1 — Infos générales. Sans `id` dans le formulaire : création (POST,
// force BROUILLON côté serveur). Avec `id` : édition (PATCH) — cas où
// l'utilisateur revient en arrière modifier cette étape après l'avoir
// déjà validée une première fois.
export async function enregistrerInfosGeneralesAction(
  _prevState: DepotFormState,
  formData: FormData,
): Promise<DepotFormState> {
  const id = String(formData.get("id") ?? "");

  const input: CreerBrouillonInput = {
    titre: String(formData.get("titre") ?? ""),
    description: String(formData.get("description") ?? ""),
    prix_mad: Number(formData.get("prix_mad") ?? 0),
    loc_confidentielle: formData.get("loc_confidentielle") === "on",
    parcelle: {
      surface_ha: Number(formData.get("surface_ha") ?? 0),
      statut_foncier: String(formData.get("statut_foncier") ?? "") as StatutFoncier,
      acces_eau: String(formData.get("acces_eau") ?? "") as AccesEau,
      topographie: String(formData.get("topographie") ?? "") as Topographie,
      acces_routier: String(formData.get("acces_routier") ?? "") as AccesRoutier,
    },
  };

  try {
    const annonce = id ? await patchBrouillon(id, input) : await creerBrouillon(input);
    return { annonce, error: "", fieldErrors: null };
  } catch (err) {
    return etatErreur(err);
  }
}

// Étape 2 — Localisation. `commune` arrive en string depuis un <select> HTML
// (toujours du texte) — converti en number ici, jamais côté composant.
export async function enregistrerLocalisationAction(
  _prevState: DepotFormState,
  formData: FormData,
): Promise<DepotFormState> {
  const id = String(formData.get("id") ?? "");
  const communeRaw = String(formData.get("commune") ?? "");
  const latitudeRaw = String(formData.get("latitude") ?? "");
  const longitudeRaw = String(formData.get("longitude") ?? "");
  // JSON [[lat, lng], ...] posé par EtapeLocalisation.tsx uniquement quand le
  // vendeur a choisi le mode Polygone et tracé ≥3 sommets — "" sinon (mode
  // Point, ou tracé abandonné en repassant en mode Point avant validation).
  const contourRaw = String(formData.get("contour") ?? "");

  try {
    const annonce = await patchBrouillon(id, {
      parcelle: {
        commune: communeRaw ? Number(communeRaw) : null,
        latitude: latitudeRaw ? Number(latitudeRaw) : null,
        longitude: longitudeRaw ? Number(longitudeRaw) : null,
        contour: contourRaw ? (JSON.parse(contourRaw) as [number, number][]) : null,
      },
    });
    return { annonce, error: "", fieldErrors: null };
  } catch (err) {
    return etatErreur(err);
  }
}

// Étape 3 — Photos. Appelée impérativement (pas via <form action=...>) juste
// après compression navigateur de chaque fichier sélectionné, pas via
// useActionState — le composant a besoin du retour immédiat pour mettre à
// jour ses previews, pas d'un cycle de re-render de formulaire.
export async function ajouterPhotosAction(id: string, formData: FormData): Promise<DepotFormState> {
  const fichiers = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  try {
    const annonce = await uploaderPhotos(id, fichiers);
    return { annonce, error: "", fieldErrors: null };
  } catch (err) {
    return etatErreur(err);
  }
}

// Suppression d'une photo de brouillon. Le backend réordonne déjà `ordre`
// pour rester contigu — on relit l'annonce plutôt que de recalculer cet
// ordre côté client, pour ne jamais risquer une divergence avec le serveur.
export async function supprimerPhotoAction(annonceId: string, photoId: string): Promise<DepotFormState> {
  try {
    await supprimerPhoto(annonceId, photoId);
    const annonce = await getBrouillon(annonceId);
    return { annonce, error: "", fieldErrors: null };
  } catch (err) {
    return etatErreur(err);
  }
}

// Publication — brouillon -> en_ligne. can_publish() peut renvoyer plusieurs
// raisons de blocage à la fois (géoloc + photo + prix) : fieldErrors.statut
// est la liste complète, error n'en est que la première.
export async function publierAction(id: string): Promise<DepotFormState> {
  try {
    const annonce = await patchBrouillon(id, { statut: "en_ligne" });
    return { annonce, error: "", fieldErrors: null };
  } catch (err) {
    return etatErreur(err);
  }
}
