// Client d'écriture pour le dépôt d'annonce (F03) — utilisable uniquement
// côté serveur (Server Actions), même raison que lib/auth-api.ts : l'auth
// JWT est en cookie httpOnly + SameSite=Lax en dev, donc un fetch() direct
// depuis le navigateur vers l'API (origine différente) n'attacherait jamais
// ce cookie. On lit/renvoie donc explicitement les cookies de la requête
// entrante ici, exactement comme auth-api.ts le fait pour login/signup.
//
// Migration du 2026-07-30 (plan refresh/rotation) : creerBrouillon,
// patchBrouillon, uploaderPhotos et supprimerPhoto passent par
// fetchWithAuth() (refresh automatique sur 401) car ils ne sont appelés que
// depuis des Server Actions (app/actions/depot-annonce.ts,
// app/actions/annonces.ts) — jamais depuis un Server Component.
// getBrouillon() et getMesAnnonces() restent sur un fetch simple : la
// première est appelée à la fois par une Server Action ET directement par
// app/publier/page.tsx (Server Component) ; la seconde uniquement par
// app/compte/annonces/page.tsx (Server Component). fetchWithAuth y lèverait
// la même erreur cookies().set() que l'ancien getCurrentUser(). /publier et
// /compte/annonces sont de toute façon couvertes par le matcher de
// proxy.ts, donc l'access_token y est déjà rafraîchi avant exécution.

import { cookies } from "next/headers";
import { ApiError, lireErreur } from "./api";
import { fetchWithAuth } from "./fetchWithAuth";
import { mapAnnonceToAnnonceProprietaire, type AnnonceListDTO } from "./mapAnnonceToParcelle";
import type { AnnonceEcriture, ParcelleEcriture } from "@/types/depot-annonce";
import type { AnnonceProprietaire, StatutAnnonce } from "@/types/parcelle";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");

async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
}

async function lireOuLeverErreur(res: Response): Promise<never> {
  const { message, fieldErrors } = await lireErreur(res);
  throw new ApiError(res.status, message, fieldErrors);
}

export type CreerBrouillonInput = {
  titre: string;
  description: string;
  prix_mad: number;
  loc_confidentielle: boolean;
  parcelle: Pick<ParcelleEcriture, "surface_ha" | "statut_foncier" | "acces_eau" | "topographie" | "acces_routier">;
};

// Appelée uniquement depuis app/actions/depot-annonce.ts (Server Action).
export async function creerBrouillon(input: CreerBrouillonInput): Promise<AnnonceEcriture> {
  const res = await fetchWithAuth(`${API_URL}/annonces/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as AnnonceEcriture;
}

export type PatchBrouillonInput = Partial<{
  titre: string;
  description: string;
  prix_mad: number;
  // Élargi aux 5 statuts (P2 — 2026-07-30, machine d'états annonces/transitions.py
  // côté backend) : ce type couvre aussi bien le PATCH du wizard de dépôt
  // (toujours brouillon|en_ligne en pratique) que les actions du dashboard
  // propriétaire (archiver/marquer vendue/réactiver, cf. app/actions/annonces.ts).
  statut: StatutAnnonce;
  loc_confidentielle: boolean;
  parcelle: Partial<ParcelleEcriture>;
}>;

// Appelée depuis app/actions/depot-annonce.ts et app/actions/annonces.ts
// (Server Actions uniquement).
export async function patchBrouillon(id: string, patch: PatchBrouillonInput): Promise<AnnonceEcriture> {
  const res = await fetchWithAuth(`${API_URL}/annonces/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as AnnonceEcriture;
}

// Photos compressées côté navigateur (browser-image-compression, Web Worker)
// puis remontées ici en FormData — jamais de Content-Type manuel : fetch()
// doit fixer lui-même la boundary multipart/form-data. Appelée uniquement
// depuis app/actions/depot-annonce.ts (Server Action).
export async function uploaderPhotos(id: string, fichiers: File[]): Promise<AnnonceEcriture> {
  const formData = new FormData();
  for (const fichier of fichiers) {
    formData.append("photos[]", fichier, fichier.name);
  }

  const res = await fetchWithAuth(`${API_URL}/annonces/${id}/`, {
    method: "PATCH",
    body: formData,
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as AnnonceEcriture;
}

// Appelée à la fois par une Server Action (supprimerPhotoAction) ET
// directement par app/publier/page.tsx (Server Component) : PAS de
// fetchWithAuth ici (cf. commentaire d'en-tête).
export async function getBrouillon(id: string): Promise<AnnonceEcriture> {
  const res = await fetch(`${API_URL}/annonces/${id}/`, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as AnnonceEcriture;
}

// Toutes les annonces du propriétaire connecté, tous statuts (dashboard) —
// [] si non authentifié plutôt que de lever, même convention que
// favoris-api.ts (l'appelant décide quoi faire). Appelée directement par
// app/compte/annonces/page.tsx (Server Component) : PAS de fetchWithAuth ici
// (cf. commentaire d'en-tête).
export async function getMesAnnonces(): Promise<AnnonceProprietaire[]> {
  const res = await fetch(`${API_URL}/annonces/mes-annonces/`, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const annonces = (await res.json()) as AnnonceListDTO[];
  return annonces.map(mapAnnonceToAnnonceProprietaire);
}

export type MesStatistiquesDTO = {
  favoris_recus: number;
  conversations_recues: number;
  messages_non_lus: number;
};

// Favoris/conversations reçus, messages non lus (dashboard propriétaire) —
// tout à 0 si non authentifié ou en cas d'échec, même convention que
// getMesAnnonces() ci-dessus (bloc de stats non bloquant, jamais de throw).
// Appelée uniquement par app/compte/annonces/page.tsx (Server Component) :
// PAS de fetchWithAuth, même raison que getMesAnnonces() ci-dessus.
export async function getMesStatistiques(): Promise<MesStatistiquesDTO> {
  const res = await fetch(`${API_URL}/annonces/mes-annonces/statistiques/`, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
  });
  if (!res.ok) return { favoris_recus: 0, conversations_recues: 0, messages_non_lus: 0 };
  return (await res.json()) as MesStatistiquesDTO;
}

// Restreint aux brouillons (statut BROUILLON) côté serveur — l'édition
// d'annonces déjà en_ligne reste hors périmètre F03. Le backend réordonne
// les photos restantes pour garder `ordre` contigu à partir de 0. Appelée
// uniquement depuis app/actions/depot-annonce.ts (Server Action).
export async function supprimerPhoto(annonceId: string, photoId: string): Promise<void> {
  const res = await fetchWithAuth(`${API_URL}/annonces/${annonceId}/photos/${photoId}/`, {
    method: "DELETE",
  });
  if (!res.ok) await lireOuLeverErreur(res);
}
