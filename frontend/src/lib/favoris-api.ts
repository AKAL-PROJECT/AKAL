// Client Favoris pour l'API AKAL — utilisable uniquement côté serveur
// (Server Actions), même contrainte que lib/auth-api.ts : les cookies
// httpOnly (access_token, csrftoken) ne sont lisibles que via next/headers,
// donc `fetch` doit les reporter explicitement vers le backend.
//
// Migration du 2026-07-30 (plan refresh/rotation) : getFavorisIds() et
// toggleFavori() passent par fetchWithAuth() (refresh automatique sur 401)
// car ils ne sont JAMAIS appelés que depuis des Server Actions
// (app/actions/favoris.ts) — jamais depuis un Server Component. getFavoris(),
// en revanche, est appelée directement par app/favoris/page.tsx (Server
// Component) : elle reste sur un fetch simple, sans fetchWithAuth (qui
// lèverait la même erreur cookies().set() que l'ancien getCurrentUser() si
// un 401 survenait ici) — /favoris est de toute façon couverte par le
// matcher de proxy.ts, donc l'access_token y est déjà rafraîchi avant que
// cette fonction ne s'exécute.

import { cookies } from "next/headers";
import { ApiError, lireErreur } from "./api";
import { fetchWithAuth } from "./fetchWithAuth";
import { mapAnnonceToParcelle, type AnnonceListDTO } from "./mapAnnonceToParcelle";
import type { Parcelle } from "@/types/parcelle";

import { API_URL } from "./api-base";

async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
}

// `annonce` est nesté (AnnonceListSerializer) depuis l'ajout de la page
// /favoris — plus un UUID brut. FavoriDTO reflète la forme réelle renvoyée
// par GET /api/favoris/ ; on ne garde que ce dont ce fichier a besoin.
type FavoriDTO = { annonce: AnnonceListDTO };

// Ids des annonces mises en favori par l'utilisateur courant. Retourne un
// tableau vide plutôt que de lever si non authentifié (l'appelant décide
// quoi faire, cf. app/actions/favoris.ts). Appelée uniquement depuis
// getFavorisIdsAction() (Server Action) — jamais depuis un Server Component.
export async function getFavorisIds(): Promise<string[]> {
  const res = await fetchWithAuth(`${API_URL}/favoris/`);
  if (!res.ok) return [];
  const favoris = (await res.json()) as FavoriDTO[];
  return favoris.map((f) => f.annonce.id);
}

// Annonces favorites de l'utilisateur courant, déjà mappées vers le type
// front — pour la page /favoris. Retourne un tableau vide si non
// authentifié, même convention que getFavorisIds(). Appelée directement par
// app/favoris/page.tsx (Server Component) : PAS de fetchWithAuth ici (cf.
// commentaire d'en-tête).
export async function getFavoris(): Promise<Parcelle[]> {
  const res = await fetch(`${API_URL}/favoris/`, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const favoris = (await res.json()) as FavoriDTO[];
  return favoris.map((f) => mapAnnonceToParcelle(f.annonce));
}

// Ajoute/retire une annonce des favoris. Retourne le nouvel état. Appelée
// uniquement depuis toggleFavoriAction() (Server Action) — jamais depuis un
// Server Component.
export async function toggleFavori(annonceId: string): Promise<boolean> {
  const res = await fetchWithAuth(`${API_URL}/favoris/toggle/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ annonce: annonceId }),
  });
  if (!res.ok) {
    const { message, fieldErrors } = await lireErreur(res);
    throw new ApiError(res.status, message, fieldErrors);
  }
  const data = (await res.json()) as { is_favori: boolean };
  return data.is_favori;
}
