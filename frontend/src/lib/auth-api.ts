// Client d'auth pour l'API AKAL — utilisable uniquement côté serveur
// (Server Components / Server Actions), car il lit/écrit les cookies de la
// requête entrante via `next/headers`.
//
// Le backend pose des cookies httpOnly (access_token, refresh_token) et un
// cookie lisible (csrftoken, cf. contrat CSRF double-submit). `fetch` côté
// serveur n'a pas de jar de cookies navigateur : on doit donc explicitement
// (1) renvoyer les cookies de la requête entrante vers le backend, et
// (2) reporter les Set-Cookie de la réponse backend sur la réponse Next.js.
//
// cf. docs/plans/2026-07-24-auth-module-design.md

import { cookies } from "next/headers";
import { ApiError, lireErreur, type FieldErrors } from "./api";
import { attrsVersOptions, parseSetCookie } from "./cookie-parsing";
import { fetchWithAuth } from "./fetchWithAuth";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");

// Pas de rôle figé à l'inscription (une même personne peut chercher et
// vendre une terre) : "" par défaut, ADMIN réservé au staff. cf. design doc,
// addendum du 2026-07-24.
export type Role = "VENDEUR" | "ACHETEUR" | "ADMIN" | "";

export type User = {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  telephone: string | null;
  avatar: string | null;
  role: Role;
  is_verified: boolean;
  date_inscription: string;
};

export type SignupInput = {
  email: string;
  password: string;
  nom: string;
  prenom: string;
  telephone?: string;
};

export type LoginInput = { email: string; password: string };

const COOKIES_A_SUIVRE = new Set(["access_token", "refresh_token", "csrftoken"]);

// Reporte les Set-Cookie de la réponse backend sur le jar Next.js courant.
// parseSetCookie/attrsVersOptions partagés avec lib/auth-refresh.ts et
// proxy.ts (cf. lib/cookie-parsing.ts) — déduplication du 2026-07-30, aucun
// changement de comportement.
async function suivreCookies(res: Response) {
  const jar = await cookies();
  const setCookie = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];

  for (const raw of setCookie) {
    const { name, value, attrs } = parseSetCookie(raw);
    if (!COOKIES_A_SUIVRE.has(name)) continue;
    jar.set(name, value, attrsVersOptions(attrs));
  }
}

async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
}

export async function signup(input: SignupInput): Promise<User> {
  const res = await fetch(`${API_URL}/auth/signup/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) {
    const { message, fieldErrors } = await lireErreur(res);
    throw new ApiError(res.status, message, fieldErrors);
  }
  await suivreCookies(res);
  return (await res.json()) as User;
}

export async function login(input: LoginInput): Promise<User> {
  const res = await fetch(`${API_URL}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) {
    const { message, fieldErrors } = await lireErreur(res);
    throw new ApiError(res.status, message, fieldErrors);
  }
  await suivreCookies(res);
  return (await res.json()) as User;
}

// Édition de profil (page /compte, mission « avatar + téléphone ») —
// PATCH /auth/me/, même endpoint que getCurrentUser() (accounts/views.py::
// MeView, désormais RetrieveUpdateAPIView). FormData plutôt que JSON dans
// tous les cas (même si l'appelant ne modifie que le téléphone) : au moins
// un des deux champs (avatar) est un fichier, donc multipart de toute façon
// — même choix que uploaderPhotos() ci-dessous pour les photos d'annonce.
// Authentifié (contrairement à signup/login) : passe par fetchWithAuth
// (cookie + CSRF + retry sur 401), pas un fetch nu.
export async function updateProfil(formData: FormData): Promise<User> {
  const res = await fetchWithAuth(`${API_URL}/auth/me/`, {
    method: "PATCH",
    body: formData,
  });
  if (!res.ok) {
    const { message, fieldErrors } = await lireErreur(res);
    throw new ApiError(res.status, message, fieldErrors);
  }
  return (await res.json()) as User;
}

export type PasswordResetRequestInput = { email: string };
export type PasswordResetConfirmInput = { uid: string; token: string; password: string };

// Ni l'un ni l'autre ne pose de cookie de session (pas de connexion
// automatique après réinitialisation) : fetch direct comme signup/login,
// mais sans suivreCookies().
export async function requestPasswordReset(input: PasswordResetRequestInput): Promise<void> {
  const res = await fetch(`${API_URL}/auth/password-reset/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) {
    const { message, fieldErrors } = await lireErreur(res);
    throw new ApiError(res.status, message, fieldErrors);
  }
}

export async function confirmPasswordReset(input: PasswordResetConfirmInput): Promise<void> {
  const res = await fetch(`${API_URL}/auth/password-reset/confirm/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) {
    const { message, fieldErrors } = await lireErreur(res);
    throw new ApiError(res.status, message, fieldErrors);
  }
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const csrftoken = jar.get("csrftoken")?.value;

  const res = await fetch(`${API_URL}/auth/logout/`, {
    method: "POST",
    headers: {
      Cookie: await cookieHeader(),
      ...(csrftoken ? { "X-CSRFToken": csrftoken } : {}),
    },
    cache: "no-store",
  });
  await suivreCookies(res);
}

async function fetchMe(): Promise<Response> {
  return fetch(`${API_URL}/auth/me/`, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
    // Borne le temps d'attente (même convention que apiFetch, cf. lib/api.ts)
    // : sans ça, un backend qui ne répond pas du tout (au lieu de refuser la
    // connexion) bloquerait indéfiniment le rendu du layout racine, qui
    // attend cet appel sur CHAQUE page.
    signal: AbortSignal.timeout(10000),
  });
}

// Utilisateur courant, ou null si non authentifié — et aussi null si son
// statut n'a pas pu être déterminé (backend injoignable/en timeout). Ce
// second cas est traité comme "non connecté" plutôt que par une exception :
// getCurrentUser() est appelée sans garde depuis le layout racine (chaque
// page), donc une exception ici ferait planter l'application entière au
// lieu de dégrader vers un simple état déconnecté (cf. audit du 17/08/2026,
// même logique déjà appliquée à fetchNombreMessagesNonLus() juste à côté
// dans app/layout.tsx). Un seul essai, aucune retentative : un backend
// indisponible ne doit pas se traduire par des requêtes en boucle.
//
// Simplifié le 2026-07-30 : ne tente plus de refresh ici. Pour les routes
// protégées, proxy.ts a déjà rafraîchi la session AVANT que ce Server
// Component ne s'exécute (cf. proxy.ts) — l'access_token lu ici est donc
// déjà à jour. Un 401 à ce stade signifie une vraie fin de session (refresh
// expiré/absent/blacklisté, cf. audit rotation du 2026-07-30), pas un access
// token simplement périmé : chaque page protégée gère déjà ce cas via son
// propre `if (!utilisateur) redirect(...)`.
//
// Ne PAS réintroduire de refresh ici : appeler cookies().set() depuis un
// Server Component lève "Cookies can only be modified in a Server Action or
// Route Handler" (confirmé par test réel) — c'est ce bug précis que cette
// simplification élimine.
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  if (!jar.get("access_token") && !jar.get("refresh_token")) return null;

  let res: Response;
  try {
    res = await fetchMe();
  } catch {
    // fetch a rejeté : backend injoignable, DNS, timeout (AbortError),
    // connexion refusée... Traité comme non connecté, pas comme un crash.
    return null;
  }
  if (!res.ok) return null;

  try {
    return (await res.json()) as User;
  } catch {
    // 200 mais corps illisible (backend qui répond de façon incohérente) :
    // même traitement, impossible d'affirmer qui est l'utilisateur courant.
    return null;
  }
}

export type { FieldErrors };

export async function phoneLoginRequest(telephone: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/phone/request/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telephone }),
    cache: "no-store",
  });
  if (!res.ok) {
    const { message, fieldErrors } = await lireErreur(res);
    throw new ApiError(res.status, message, fieldErrors);
  }
}

export async function phoneLoginVerify(token: string, prenom?: string, nom?: string): Promise<User> {
  const res = await fetch(`${API_URL}/auth/phone/verify/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, prenom, nom }),
    cache: "no-store",
  });
  if (!res.ok) {
    const { message, fieldErrors } = await lireErreur(res);
    throw new ApiError(res.status, message, fieldErrors);
  }
  await suivreCookies(res);
  return (await res.json()) as User;
}

export async function googleLogin(token: string): Promise<User> {
  const res = await fetch(`${API_URL}/auth/google/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    cache: "no-store",
  });
  if (!res.ok) {
    const { message, fieldErrors } = await lireErreur(res);
    throw new ApiError(res.status, message, fieldErrors);
  }
  await suivreCookies(res);
  return (await res.json()) as User;
}


