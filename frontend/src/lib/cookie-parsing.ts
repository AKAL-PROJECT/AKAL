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
export function attrsVersOptions(attrs: Record<string, string>) {
  return {
    httpOnly: "httponly" in attrs,
    secure: "secure" in attrs,
    sameSite: (attrs["samesite"]?.toLowerCase() as "lax" | "strict" | "none" | undefined) ?? "lax",
    path: attrs["path"] ?? "/",
    maxAge: attrs["max-age"] !== undefined ? Number(attrs["max-age"]) : undefined,
  };
}
