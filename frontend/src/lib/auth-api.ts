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

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");

export type Role = "VENDEUR" | "ACHETEUR" | "ADMIN";

export type User = {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  telephone: string | null;
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
  role: Extract<Role, "VENDEUR" | "ACHETEUR">;
};

export type LoginInput = { email: string; password: string };

const COOKIES_A_SUIVRE = new Set(["access_token", "refresh_token", "csrftoken"]);

function parseSetCookie(raw: string) {
  const [pair, ...attrParts] = raw.split(";").map((p) => p.trim());
  const eq = pair.indexOf("=");
  const name = pair.slice(0, eq);
  const value = pair.slice(eq + 1);
  const attrs: Record<string, string> = {};
  for (const part of attrParts) {
    const [k, v] = part.split("=");
    attrs[k.toLowerCase()] = v ?? "true";
  }
  return { name, value, attrs };
}

// Reporte les Set-Cookie de la réponse backend sur le jar Next.js courant.
async function suivreCookies(res: Response) {
  const jar = await cookies();
  const setCookie = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];

  for (const raw of setCookie) {
    const { name, value, attrs } = parseSetCookie(raw);
    if (!COOKIES_A_SUIVRE.has(name)) continue;

    jar.set(name, value, {
      httpOnly: "httponly" in attrs,
      secure: "secure" in attrs,
      sameSite: (attrs["samesite"]?.toLowerCase() as "lax" | "strict" | "none" | undefined) ?? "lax",
      path: attrs["path"] ?? "/",
      maxAge: attrs["max-age"] !== undefined ? Number(attrs["max-age"]) : undefined,
    });
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

// Tente un /auth/refresh/ (rotation des cookies) — utilisé quand l'access
// token a expiré mais qu'un refresh token est peut-être encore valide.
async function tenterRefresh(): Promise<boolean> {
  const jar = await cookies();
  if (!jar.get("refresh_token")) return false;

  const csrftoken = jar.get("csrftoken")?.value;
  const res = await fetch(`${API_URL}/auth/refresh/`, {
    method: "POST",
    headers: {
      Cookie: await cookieHeader(),
      ...(csrftoken ? { "X-CSRFToken": csrftoken } : {}),
    },
    cache: "no-store",
  });
  if (!res.ok) return false;
  await suivreCookies(res);
  return true;
}

async function fetchMe(): Promise<Response> {
  return fetch(`${API_URL}/auth/me/`, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
  });
}

// Utilisateur courant, ou null si non authentifié. Tente un refresh
// silencieux une fois si l'access token semble expiré (cf. flux #3 du
// design) avant de conclure à une session invalide.
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  if (!jar.get("access_token") && !jar.get("refresh_token")) return null;

  let res = await fetchMe();
  if (res.status === 401 && (await tenterRefresh())) {
    res = await fetchMe();
  }
  if (!res.ok) return null;
  return (await res.json()) as User;
}

export type { FieldErrors };
