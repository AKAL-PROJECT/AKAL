// Garde de session — responsabilité UNIQUE : gérer la session avant que la
// page ne se rende. Ne connaît ni favoris, ni annonces, ni messages.
//
// Depuis Next.js 16, ce fichier s'appelle `proxy.ts` (anciennement
// `middleware.ts`) — cf. node_modules/next/dist/docs/.../16-proxy.md.
//
// Révision du 2026-07-30 (audit indépendant) : la première version ne
// s'exécutait que sur un sous-ensemble de routes (/compte, /publier,
// /messages, /favoris, /bienvenue), alors que getCurrentUser() — devenu un
// lecteur pur, cf. lib/auth-api.ts — est consulté par TOUTE page (via
// app/layout.tsx). Sur les pages hors de cet ancien périmètre (/, /parcelles,
// /comparateur...), un access_token expiré faisait apparaître l'utilisateur
// comme déconnecté dans le Navbar alors que son refresh_token était valide,
// et une Server Action déclenchée depuis ces pages (ex. toggleFavoriAction)
// redirigeait vers /connexion avant même d'atteindre la logique de refresh
// de fetchWithAuth(). Constaté par reproduction réelle, pas supposé.
//
// Le proxy s'exécute maintenant sur toute page HTML (cf. `config.matcher`
// ci-dessous, qui exclut seulement assets/API), mais son comportement
// diverge selon que la route est protégée ou non :
//
//   route protégée (ROUTES_PROTEGEES) ?
//     |                                    |
//    oui                                  non (page publique)
//     |                                    |
//   access valide ?                    access valide ?
//   oui -> next()                      oui -> next()
//   non -> refresh possible ?          non -> refresh possible ?
//            oui -> cookies à jour +           oui -> cookies à jour + next()
//                   next()                     non -> next() QUAND MÊME,
//            non -> redirect /connexion                sans cookies à jour
//                                                       (rendu anonyme, PAS
//                                                       de redirection —
//                                                       une page publique ne
//                                                       doit jamais exiger
//                                                       de session)
//
// getCurrentUser() (lib/auth-api.ts) ne tente plus jamais de refresh lui-même
// et ne modifie jamais les cookies — il lit l'état de session tel qu'il
// arrive au rendu, déjà à jour grâce à ce proxy. Cela évite entièrement le
// problème de rotation des refresh tokens dans un Server Component (un
// refresh qui réussirait sans pouvoir persister le nouveau cookie
// blackliste l'ancien sans que le navigateur reçoive le nouveau — reproduit
// expérimentalement lors du tour précédent de cette investigation).
//
// Ce fast-path (décoder l'exp sans vérifier la signature) ne remplace pas
// la vérification réelle : le backend revalide le JWT à chaque appel API
// quoi qu'il arrive (cf. accounts/authentication.py::CookieJWTAuthentication).
// Le rôle de ce middleware est UX seulement : éviter qu'une page entière se
// rende avant de découvrir, une fois le premier appel API fait, que la
// session a expiré.

// Routes qui exigent réellement une session — chaque page correspondante
// fait déjà son propre `if (!utilisateur) redirect(...)` (cf. lib/auth-api.ts
// getCurrentUser(), maintenant un lecteur pur). Toute autre route matchée
// par `config.matcher` est traitée comme publique : le refresh y est
// tenté par confort (pour que le Navbar reflète une session valide) mais
// son échec ne redirige JAMAIS — /connexion et /inscription ont d'ailleurs
// la logique inverse (redirigent SI une session existe), gérée par les
// pages elles-mêmes, pas ici.
const ROUTES_PROTEGEES = [/^\/compte(\/|$)/, /^\/bienvenue(\/|$)/, /^\/publier(\/|$)/, /^\/messages(\/|$)/, /^\/favoris(\/|$)/];

function estRouteProtegee(pathname: string): boolean {
  return ROUTES_PROTEGEES.some((re) => re.test(pathname));
}

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

  // Backend injoignable (down, pas encore démarré en dev...) -> même
  // contrat que "refresh refusé" ci-dessus : null, jamais une exception qui
  // remonterait jusqu'au rendu de la page. Un fetch réseau qui échoue (DNS,
  // connexion refusée...) rejette la promesse avant même de produire une
  // Response, donc pas de `res.ok` à tester ici — d'où le try/catch, distinct
  // du cas "res.ok === false" traité plus bas.
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/refresh/`, {
      method: "POST",
      headers: {
        Cookie: request.headers.get("cookie") ?? "",
        ...(csrftoken ? { "X-CSRFToken": csrftoken } : {}),
      },
    });
  } catch {
    return null;
  }
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
  const protegee = estRouteProtegee(request.nextUrl.pathname);
  const accessToken = request.cookies.get("access_token")?.value;

  if (accessToken && accessEncoreValide(accessToken)) {
    return NextResponse.next();
  }

  const cookiesRafraichis = await tenterRefreshEdge(request);
  if (!cookiesRafraichis) {
    // Refresh impossible (pas de refresh_token) ou refusé (expiré/blacklisté).
    // Route protégée -> fin de session réelle, redirection. Route publique
    // -> laisser passer quand même, rendu anonyme (jamais de redirection
    // sur une page qui n'a jamais exigé de session).
    return protegee ? rediriger(request) : NextResponse.next();
  }

  const response = NextResponse.next();
  for (const { name, value, options } of cookiesRafraichis) {
    response.cookies.set(name, value, options);
  }
  return response;
}

// Toute page HTML — exclut uniquement les assets Next.js (_next/static,
// _next/image), le favicon, les fichiers statiques (extensions courantes,
// couvre notamment public/uploads/*.svg) et un éventuel /api/ futur (aucun
// Route Handler Next.js n'existe aujourd'hui, le backend Django est sur une
// origine séparée — exclusion conservée par précaution/convention standard).
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
