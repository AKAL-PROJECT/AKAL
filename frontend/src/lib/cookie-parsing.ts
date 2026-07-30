// Parsing pur d'un en-tête Set-Cookie — aucune dépendance Next.js/runtime,
// pour être importable aussi bien depuis le runtime Edge (proxy.ts,
// middleware) que depuis le runtime Node.js (lib/auth-refresh.ts,
// Server Actions/Route Handlers). Les deux runtimes lisent les mêmes
// Set-Cookie renvoyés par le backend, mais les persistent via des API
// différentes (NextResponse.cookies vs next/headers cookies()) — seule
// cette étape de lecture est commune.

export type SetCookieParse = {
  name: string;
  value: string;
  attrs: Record<string, string>;
};

export function parseSetCookie(raw: string): SetCookieParse {
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

// Options telles qu'attendues par next/headers cookies().set() ET par
// NextResponse.cookies.set() — les deux API acceptent la même forme.
//
// `path` toujours forcé à "/" (audit du 2026-07-30, 2e passe indépendante) —
// ne JAMAIS reprendre tel quel le Path du Set-Cookie backend. Django pose
// refresh_token avec Path=/api/auth/ (AUTH_COOKIE_REFRESH_PATH,
// akal/settings/base.py), un scoping cohérent SI le navigateur parlait
// directement au backend. Ici, ce cookie est re-émis sur l'origine du
// FRONTEND (Next.js), qui n'a aucune route /api/auth/ — un navigateur réel
// n'attache alors JAMAIS refresh_token à une requête vers /parcelles, /compte,
// etc. (RFC 6265, path-matching), quel que soit le code de rafraîchissement
// écrit côté serveur : jar.get("refresh_token") y est toujours vide. Confirmé
// avec le moteur de cookie natif de curl (pas un header construit à la main,
// qui masquait le bug) : seuls access_token/csrftoken partent vers /parcelles,
// jamais refresh_token. Le scoping /api/auth/ de Django reste correct pour
// un accès direct au backend (admin, tests API) ; il ne doit simplement
// jamais être recopié tel quel sur la copie que le frontend réémet pour son
// propre domaine.
export function attrsVersOptions(attrs: Record<string, string>) {
  return {
    httpOnly: "httponly" in attrs,
    secure: "secure" in attrs,
    sameSite: (attrs["samesite"]?.toLowerCase() as "lax" | "strict" | "none" | undefined) ?? "lax",
    path: "/",
    maxAge: attrs["max-age"] !== undefined ? Number(attrs["max-age"]) : undefined,
  };
}
