// Garde de session pour les routes protégées (audit du 2026-07-30, plan de
// résolution refresh/rotation) — responsabilité UNIQUE : gérer la session
// avant que la page ne se rende. Ne connaît ni favoris, ni annonces, ni
// messages.
//
// Depuis Next.js 16, ce fichier s'appelle `proxy.ts` (anciennement
// `middleware.ts`) — cf. node_modules/next/dist/docs/.../16-proxy.md.
//
// Flux :
//   route protégée ? -- non --> next()
//        |
//       oui
//        |
//   access_token valide (exp non expiré, lu localement, PAS vérifié
//   cryptographiquement ici — cf. estEncoreValide) ?
//        |                                    |
//       oui                                  non
//        |                                    |
//     next()                    refresh_token présent ?
//                                     |            |
//                                    non           oui
//                                     |            |
//                              redirect      POST /api/auth/refresh/
//                              /connexion         |
//                                            succès ?
//                                          /          \
//                                        oui           non
//                                         |              |
//                              cookies mis à jour   redirect /connexion
//                              (NextResponse) + next()
//
// Ce fast-path (décoder l'exp sans vérifier la signature) ne remplace pas
// la vérification réelle : le backend revalide le JWT à chaque appel API
// quoi qu'il arrive (cf. accounts/authentication.py::CookieJWTAuthentication).
// Le rôle de ce middleware est UX seulement : éviter qu'une page entière se
// rende avant de découvrir, une fois le premier appel API fait, que la
// session a expiré.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { attrsVersOptions, parseSetCookie } from "@/lib/cookie-parsing";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");

// Décode le payload d'un JWT (base64url, aucune vérification de signature —
// le secret n'est pas côté frontend, cf. commentaire ci-dessus) pour lire
// `exp` sans appel réseau.
function decoderPayloadJWT(token: string): { exp?: number } | null {
  try {
    const payloadB64 = token.split(".")[1];
    const normalise = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalise));
  } catch {
    return null;
  }
}

function accessEncoreValide(token: string): boolean {
  const payload = decoderPayloadJWT(token);
  if (!payload?.exp) return false;
  // Marge de 5s : évite qu'un token jugé "valide" ici expire pendant le
  // trajet réseau vers le backend, quelques millisecondes plus tard.
  return payload.exp * 1000 > Date.now() + 5000;
}

function rediriger(request: NextRequest) {
  const url = new URL("/connexion", request.url);
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

// Rafraîchit la session côté Edge — ne peut PAS réutiliser
// lib/auth-refresh.ts (dépend de next/headers, indisponible dans le
// runtime Edge du middleware) ni ses cookies().set() (l'API de cookies du
// middleware est NextResponse.cookies, une surface différente). Seule la
// lecture des Set-Cookie (parseSetCookie/attrsVersOptions) est partagée.
async function tenterRefreshEdge(
  request: NextRequest,
): Promise<Array<{ name: string; value: string; options: ReturnType<typeof attrsVersOptions> }> | null> {
  const refreshToken = request.cookies.get("refresh_token")?.value;
  if (!refreshToken) return null;

  const csrftoken = request.cookies.get("csrftoken")?.value;
  const res = await fetch(`${API_URL}/auth/refresh/`, {
    method: "POST",
    headers: {
      Cookie: request.headers.get("cookie") ?? "",
      ...(csrftoken ? { "X-CSRFToken": csrftoken } : {}),
    },
  });
  if (!res.ok) return null;

  const cookiesAAppliquer: Array<{ name: string; value: string; options: ReturnType<typeof attrsVersOptions> }> = [];
  for (const raw of res.headers.getSetCookie()) {
    const { name, value, attrs } = parseSetCookie(raw);
    if (name !== "access_token" && name !== "refresh_token") continue;
    cookiesAAppliquer.push({ name, value, options: attrsVersOptions(attrs) });
  }
  return cookiesAAppliquer;
}

export async function proxy(request: NextRequest) {
  const accessToken = request.cookies.get("access_token")?.value;

  if (accessToken && accessEncoreValide(accessToken)) {
    return NextResponse.next();
  }

  const cookiesRafraichis = await tenterRefreshEdge(request);
  if (!cookiesRafraichis) {
    return rediriger(request);
  }

  const response = NextResponse.next();
  for (const { name, value, options } of cookiesRafraichis) {
    response.cookies.set(name, value, options);
  }
  return response;
}

// IMPORTANT : jamais /:path*. Uniquement les routes qui exigent réellement
// une session (chaque page correspondante fait déjà son propre
// `if (!utilisateur) redirect(...)`, cf. audit du 2026-07-30) — pas les
// assets (JS/CSS/images/favicon) ni les endpoints API. /favoris ajoutée
// au-delà de l'exemple donné : app/favoris/page.tsx exige aussi une session
// (même pattern que /compte, /publier, /messages).
export const config = {
  matcher: [
    "/compte/:path*",
    "/bienvenue/:path*",
    "/publier/:path*",
    "/messages/:path*",
    "/favoris/:path*",
  ],
};
