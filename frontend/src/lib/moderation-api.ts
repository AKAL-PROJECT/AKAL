// Client du dashboard modérateur (/moderation, 2026-10-01) — même
// séparation que lib/annonces-api.ts : getQueueModeration() est un fetch
// simple (appelée uniquement depuis app/moderation/page.tsx, un Server
// Component — fetchWithAuth y lèverait l'erreur cookies().set(), cf.
// lib/annonces-api.ts) ; decider() passe par fetchWithAuth (appelée
// uniquement depuis app/actions/moderation.ts, une Server Action).
//
// Pas de vérification `peut_moderer` ici : c'est à app/moderation/page.tsx
// de garder l'accès à la page (cf. son redirect()) — l'API REST
// (PeutModererAnnonces, backend/annonces/api_views.py) reste la vraie
// barrière si ce client est appelé malgré tout sans ce droit (403, traduit
// en ApiError par lireOuLeverErreur ci-dessous).

import { cookies } from "next/headers";
import { ApiError, lireErreur } from "./api";
import { fetchWithAuth } from "./fetchWithAuth";
import type { AnnonceListDTO } from "./mapAnnonceToParcelle";

import { API_URL } from "./api-base";

export type AnnonceModerationDTO = AnnonceListDTO & {
  // Raisons détectées par le signal automatique (backend/annonces/
  // moderation.py) — chaîne vide si l'annonce est en_attente pour une autre
  // raison (aucune aujourd'hui : c'est la seule source qui y mène, cf.
  // ModerationQueueListAPIView).
  motif_moderation: string;
};

async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
}

async function lireOuLeverErreur(res: Response): Promise<never> {
  const { message, fieldErrors } = await lireErreur(res);
  throw new ApiError(res.status, message, fieldErrors);
}

// Appelée uniquement depuis app/moderation/page.tsx (Server Component).
export async function getQueueModeration(): Promise<AnnonceModerationDTO[]> {
  const res = await fetch(`${API_URL}/annonces/moderation/`, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json()) as AnnonceModerationDTO[];
}

// "valider"/"rejeter" plutôt que le statut cible brut : le composant
// appelant (ModerationScreen.tsx) n'a pas à connaître le vocabulaire de
// statut de l'annonce pour agir, seulement la décision prise.
export async function decider(id: string, decision: "valider" | "rejeter"): Promise<AnnonceModerationDTO> {
  const statut = decision === "valider" ? "en_ligne" : "brouillon";
  const res = await fetchWithAuth(`${API_URL}/annonces/moderation/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ statut }),
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as AnnonceModerationDTO;
}
