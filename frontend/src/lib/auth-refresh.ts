// Refresh de session — extrait de auth-api.ts (audit du 2026-07-30).
//
// Réutilisé exclusivement par fetchWithAuth() (lib/fetchWithAuth.ts, Server
// Actions / Route Handlers) — les seuls contextes où next/headers autorise
// cookies().set(). N'est jamais appelé depuis un Server Component : le
// refresh y a été retiré (cf. getCurrentUser() simplifié) car
// proxy.ts gère déjà le refresh AVANT le rendu de la page pour les routes
// protégées (cf. AKAL_MVP audit du 2026-07-30 : appeler cookies().set()
// depuis un Server Component lève "Cookies can only be modified in a
// Server Action or Route Handler" — confirmé par test réel).
//
// N'est PAS réutilisable tel quel par proxy.ts : ce fichier dépend de
// next/headers, disponible uniquement dans le runtime Node.js des Server
// Actions/Route Handlers. Le middleware Next.js tourne dans un runtime Edge
// séparé et gère ses cookies via NextResponse — proxy.ts a donc sa propre
// implémentation minimale de l'appel à /api/auth/refresh/, qui ne peut pas
// partager cette fonction (peut partager la logique d'appel HTTP brut si
// besoin, jamais la persistance des cookies).

import { cookies } from "next/headers";
import { attrsVersOptions, parseSetCookie } from "./cookie-parsing";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");

// Cookies de session gérés par le backend (accounts/views.py::_set_auth_cookies) —
// tout autre Set-Cookie éventuel (aucun aujourd'hui) est ignoré ici.
const COOKIES_SESSION = new Set(["access_token", "refresh_token", "csrftoken"]);

async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
}

// Tente un POST /api/auth/refresh/ avec le refresh_token courant.
//
// Retourne false immédiatement si aucun refresh_token n'est présent, ou si
// le backend rejette la tentative (refresh expiré/absent/blacklisté — cf.
// audit rotation du 2026-07-30 : un refresh déjà consommé est rejeté avec
// "Token is blacklisted", pas seulement expiré).
//
// En cas de succès, persiste les nouveaux cookies (access_token,
// refresh_token) via cookies().set() : légitime ici puisque cette fonction
// n'est appelée que depuis un contexte Server Action/Route Handler
// (fetchWithAuth) — jamais depuis un Server Component.
export async function refreshAccessToken(): Promise<boolean> {
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

  const setCookie = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const raw of setCookie) {
    const { name, value, attrs } = parseSetCookie(raw);
    if (!COOKIES_SESSION.has(name)) continue;
    jar.set(name, value, attrsVersOptions(attrs));
  }
  return true;
}
