// Client du dashboard de modération (/moderation) — côté serveur uniquement
// (Server Components / Server Actions), même raison que lib/annonces-api.ts :
// les cookies d'auth httpOnly ne sont lisibles que via next/headers.
//
// Pas de vérification `peut_moderer` ici : c'est aux pages /moderation de
// rediriger un non-modérateur, le backend (PeutModererAnnonces) restant la
// seule vraie barrière.

import { cookies } from "next/headers";
import { ApiError, lireErreur } from "./api";
import { fetchWithAuth } from "./fetchWithAuth";
import type { AnnonceDetailDTO, AnnonceListDTO } from "./mapAnnonceToParcelle";
import { entetesBackendRequete } from "./entetes-backend-serveur";
import { API_URL } from "./api-base";

export type AnnonceModerationDTO = AnnonceListDTO & {
  motif_moderation: string;
  nb_signalements: number;
};

export type SignalementDTO = {
  id: string;
  raison: string;
  raison_libelle: string;
  commentaire: string;
  statut: "ouvert" | "traite" | "classe";
  created_at: string;
  auteur: { id: string; prenom: string; email: string };
};

export type DecisionModerationDTO = {
  id: string;
  action: "validation" | "rejet" | "suspension" | "classement" | "suspension_compte" | "reactivation_compte";
  action_libelle: string;
  moderateur: string | null;
  annonce_id: string | null;
  titre_annonce: string;
  utilisateur_cible_id: string | null;
  motif: string;
  commentaire: string;
  created_at: string;
};

export type VendeurModerationDTO = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string | null;
  telephone_verifie: boolean;
  date_inscription: string;
  is_active: boolean;
  est_equipe: boolean;
  nb_annonces: number;
  nb_annonces_en_ligne: number;
  nb_rejets: number;
};

export type RevueAnnonceDTO = AnnonceDetailDTO & {
  motif_moderation: string;
  motif_rejet: string;
  vendeur: VendeurModerationDTO;
  signalements: SignalementDTO[];
  historique: DecisionModerationDTO[];
};

export type DossierVendeurDTO = {
  vendeur: VendeurModerationDTO;
  annonces: AnnonceModerationDTO[];
  historique: DecisionModerationDTO[];
};

export type Decision = "valider" | "rejeter" | "suspendre" | "classer";

async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
}

async function lireOuLeverErreur(res: Response): Promise<never> {
  const { message, fieldErrors } = await lireErreur(res);
  throw new ApiError(res.status, message, fieldErrors);
}

async function lire<T>(chemin: string): Promise<T | null> {
  const res = await fetch(`${API_URL}${chemin}`, {
    headers: { Cookie: await cookieHeader(), ...(await entetesBackendRequete()) },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as T;
}

export async function getQueueModeration(): Promise<AnnonceModerationDTO[]> {
  return (await lire<AnnonceModerationDTO[]>("/annonces/moderation/").catch(() => null)) ?? [];
}

export async function getJournalModeration(): Promise<DecisionModerationDTO[]> {
  return (await lire<DecisionModerationDTO[]>("/annonces/moderation/journal/").catch(() => null)) ?? [];
}

// Badge de la barre de navigation (layout racine) — taille de la file, sans
// la sérialiser. Jamais d'exception : 0 si l'appel échoue.
export async function getNombreAnnoncesARevoir(): Promise<number> {
  const data = await lire<{ a_revoir: number }>("/annonces/moderation/compteur/").catch(() => null);
  return data?.a_revoir ?? 0;
}

export async function getRevueAnnonce(id: string): Promise<RevueAnnonceDTO | null> {
  return lire<RevueAnnonceDTO>(`/annonces/moderation/${id}/`);
}

export async function getDossierVendeur(id: string): Promise<DossierVendeurDTO | null> {
  return lire<DossierVendeurDTO>(`/annonces/moderation/vendeurs/${id}/`);
}

export async function decider(
  id: string,
  decision: Decision,
  motif = "",
  commentaire = "",
): Promise<RevueAnnonceDTO> {
  const res = await fetchWithAuth(`${API_URL}/annonces/moderation/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, motif, commentaire }),
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as RevueAnnonceDTO;
}

export async function changerStatutVendeur(
  id: string,
  actif: boolean,
  motif = "",
  commentaire = "",
): Promise<DossierVendeurDTO> {
  const res = await fetchWithAuth(`${API_URL}/annonces/moderation/vendeurs/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actif, motif, commentaire }),
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as DossierVendeurDTO;
}

export async function signalerAnnonce(annonceId: string, raison: string, commentaire: string): Promise<string> {
  const res = await fetchWithAuth(`${API_URL}/annonces/${annonceId}/signalements/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raison, commentaire }),
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return ((await res.json()) as { detail: string }).detail;
}
