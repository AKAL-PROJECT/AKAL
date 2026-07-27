// Garde "fast-path" pour les routes protégées : vérifie la seule présence
// d'un cookie de session, sans le valider (le secret JWT n'est pas côté
// frontend). L'autorisation réelle reste imposée par le backend à chaque
// appel API ; cf. docs/plans/2026-07-24-auth-module-design.md.
//
// Depuis Next.js 16, ce fichier s'appelle `proxy.ts` (anciennement
// `middleware.ts`) — cf. node_modules/next/dist/docs/.../16-proxy.md.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const estAuthentifie = Boolean(
    request.cookies.get("access_token") ?? request.cookies.get("refresh_token")
  );

  if (!estAuthentifie) {
    const url = new URL("/connexion", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/compte/:path*", "/bienvenue/:path*"],
};
