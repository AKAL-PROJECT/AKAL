// Client Favoris pour l'API AKAL — utilisable uniquement côté serveur
// (Server Actions), même contrainte que lib/auth-api.ts : les cookies
// httpOnly (access_token, csrftoken) ne sont lisibles que via next/headers,
// donc `fetch` doit les reporter explicitement vers le backend.

import { cookies } from "next/headers";
import { ApiError, lireErreur } from "./api";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");

async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
}

async function csrfHeader(): Promise<Record<string, string>> {
  const jar = await cookies();
  const csrftoken = jar.get("csrftoken")?.value;
  return csrftoken ? { "X-CSRFToken": csrftoken } : {};
}

// Ids des annonces mises en favori par l'utilisateur courant. Retourne un
// tableau vide plutôt que de lever si non authentifié (l'appelant décide
// quoi faire, cf. app/actions/favoris.ts).
export async function getFavorisIds(): Promise<string[]> {
  const res = await fetch(`${API_URL}/favoris/`, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const favoris = (await res.json()) as { annonce: string }[];
  return favoris.map((f) => f.annonce);
}

// Ajoute/retire une annonce des favoris. Retourne le nouvel état.
export async function toggleFavori(annonceId: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/favoris/toggle/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: await cookieHeader(),
      ...(await csrfHeader()),
    },
    body: JSON.stringify({ annonce: annonceId }),
    cache: "no-store",
  });
  if (!res.ok) {
    const { message, fieldErrors } = await lireErreur(res);
    throw new ApiError(res.status, message, fieldErrors);
  }
  const data = (await res.json()) as { is_favori: boolean };
  return data.is_favori;
}
