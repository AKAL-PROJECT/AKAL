// Client d'écriture pour le dépôt d'annonce (F03) — utilisable uniquement
// côté serveur (Server Actions), même raison que lib/auth-api.ts : l'auth
// JWT est en cookie httpOnly + SameSite=Lax en dev, donc un fetch() direct
// depuis le navigateur vers l'API (origine différente) n'attacherait jamais
// ce cookie. On lit/renvoie donc explicitement les cookies de la requête
// entrante ici, exactement comme auth-api.ts le fait pour login/signup.

import { cookies } from "next/headers";
import { ApiError, lireErreur } from "./api";
import type { AnnonceEcriture, ParcelleEcriture } from "@/types/depot-annonce";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");

async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
}

async function csrfHeader(): Promise<Record<string, string>> {
  const jar = await cookies();
  const token = jar.get("csrftoken")?.value;
  return token ? { "X-CSRFToken": token } : {};
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

export async function creerBrouillon(input: CreerBrouillonInput): Promise<AnnonceEcriture> {
  const res = await fetch(`${API_URL}/annonces/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: await cookieHeader(),
      ...(await csrfHeader()),
    },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as AnnonceEcriture;
}

export type PatchBrouillonInput = Partial<{
  titre: string;
  description: string;
  prix_mad: number;
  statut: "brouillon" | "en_ligne";
  loc_confidentielle: boolean;
  parcelle: Partial<ParcelleEcriture>;
}>;

export async function patchBrouillon(id: string, patch: PatchBrouillonInput): Promise<AnnonceEcriture> {
  const res = await fetch(`${API_URL}/annonces/${id}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: await cookieHeader(),
      ...(await csrfHeader()),
    },
    body: JSON.stringify(patch),
    cache: "no-store",
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as AnnonceEcriture;
}

// Photos compressées côté navigateur (browser-image-compression, Web Worker)
// puis remontées ici en FormData — jamais de Content-Type manuel : fetch()
// doit fixer lui-même la boundary multipart/form-data.
export async function uploaderPhotos(id: string, fichiers: File[]): Promise<AnnonceEcriture> {
  const formData = new FormData();
  for (const fichier of fichiers) {
    formData.append("photos[]", fichier, fichier.name);
  }

  const res = await fetch(`${API_URL}/annonces/${id}/`, {
    method: "PATCH",
    headers: {
      Cookie: await cookieHeader(),
      ...(await csrfHeader()),
    },
    body: formData,
    cache: "no-store",
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as AnnonceEcriture;
}

export async function getBrouillon(id: string): Promise<AnnonceEcriture> {
  const res = await fetch(`${API_URL}/annonces/${id}/`, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as AnnonceEcriture;
}

// Restreint aux brouillons (statut BROUILLON) côté serveur — l'édition
// d'annonces déjà en_ligne reste hors périmètre F03. Le backend réordonne
// les photos restantes pour garder `ordre` contigu à partir de 0.
export async function supprimerPhoto(annonceId: string, photoId: string): Promise<void> {
  const res = await fetch(`${API_URL}/annonces/${annonceId}/photos/${photoId}/`, {
    method: "DELETE",
    headers: {
      Cookie: await cookieHeader(),
      ...(await csrfHeader()),
    },
    cache: "no-store",
  });
  if (!res.ok) await lireOuLeverErreur(res);
}
