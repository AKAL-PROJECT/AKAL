// Client Recherches sauvegardées (alertes, 2026-08-19) pour l'API AKAL —
// utilisable uniquement côté serveur (Server Actions), même contrainte que
// lib/favoris-api.ts : les cookies httpOnly (access_token, csrftoken) ne
// sont lisibles que via next/headers, donc `fetch` doit les reporter
// explicitement vers le backend.
//
// creerRechercheSauvegardee/supprimerRechercheSauvegardee/basculerRechercheSauvegardee
// passent par fetchWithAuth() (refresh automatique sur 401) — appelées
// uniquement depuis app/actions/recherches-sauvegardees.ts, jamais depuis
// un Server Component. getMesRecherchesSauvegardees() reste sur un fetch
// simple : appelée directement par app/compte/recherches/page.tsx (Server
// Component), même raison que getFavoris()/getMesAnnonces() ailleurs dans
// ce projet (fetchWithAuth y lèverait la même erreur cookies().set() en cas
// de 401 — /compte/recherches est de toute façon couverte par le matcher de
// proxy.ts, donc l'access_token y est déjà rafraîchi avant exécution).

import { cookies } from "next/headers";
import { ApiError, lireErreur } from "./api";
import { fetchWithAuth } from "./fetchWithAuth";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");
const BASE = `${API_URL}/annonces/recherches-sauvegardees/`;

export type RechercheSauvegardee = {
  id: string;
  nom: string;
  criteres: Record<string, string>;
  actif: boolean;
  created_at: string;
};

async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
}

async function lireOuLeverErreur(res: Response): Promise<never> {
  const { message, fieldErrors } = await lireErreur(res);
  throw new ApiError(res.status, message, fieldErrors);
}

// [] si non authentifié ou en cas d'échec — même convention que
// getFavoris()/getMesAnnonces() (page consultable dans un état "vide"
// plutôt qu'une erreur qui casse le rendu). Appelée directement par
// app/compte/recherches/page.tsx (Server Component) : PAS de fetchWithAuth
// ici (cf. commentaire d'en-tête).
export async function getMesRecherchesSauvegardees(): Promise<RechercheSauvegardee[]> {
  const res = await fetch(BASE, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json()) as RechercheSauvegardee[];
}

// Appelée uniquement depuis creerRechercheSauvegardeeAction() (Server Action).
export async function creerRechercheSauvegardee(
  nom: string,
  criteres: Record<string, string>,
): Promise<RechercheSauvegardee> {
  const res = await fetchWithAuth(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nom, criteres }),
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as RechercheSauvegardee;
}

// Appelée uniquement depuis supprimerRechercheSauvegardeeAction() (Server Action).
export async function supprimerRechercheSauvegardee(id: string): Promise<void> {
  const res = await fetchWithAuth(`${BASE}${id}/`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) await lireOuLeverErreur(res);
}

// Met en pause/réactive sans supprimer. Appelée uniquement depuis
// basculerRechercheSauvegardeeAction() (Server Action).
export async function basculerRechercheSauvegardee(id: string, actif: boolean): Promise<RechercheSauvegardee> {
  const res = await fetchWithAuth(`${BASE}${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actif }),
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as RechercheSauvegardee;
}
