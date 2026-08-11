// Tests de la garde de session (proxy.ts) — les 5 scénarios du contrat
// documenté en tête de proxy.ts (tableau de décision protégée/publique ×
// access valide/refresh possible). fetch() est mocké : aucun appel réseau
// réel vers le backend, on contrôle exactement ce que /api/auth/refresh/
// répond dans chaque cas.
//
// NextRequest/NextResponse tournent sur les Web APIs standard (Request,
// Response, Headers, URL) — pas besoin de jsdom (cf. vitest.config.ts,
// environment: "node"), exactement comme le ferait le runtime Edge réel.

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

function fakeJWT(exp: number): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ exp }));
  // Signature jamais vérifiée par proxy.ts (cf. sa propre docstring) — un
  // troisième segment quelconque suffit à avoir la forme d'un JWT.
  return `${header}.${payload}.signature`;
}

const EXP_FUTUR = Math.floor(Date.now() / 1000) + 3600; // valide 1h
const EXP_PASSE = Math.floor(Date.now() / 1000) - 3600; // expiré depuis 1h

function buildRequest(pathname: string, cookies: Record<string, string> = {}): NextRequest {
  const headers = new Headers();
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  if (cookieHeader) headers.set("cookie", cookieHeader);
  return new NextRequest(`https://akal.ma${pathname}`, { headers });
}

// NextResponse.next() pose x-middleware-next: "1" et n'a jamais de Location
// — c'est la façon canonique de distinguer un "laisser passer" d'une
// redirection, plutôt que de dépendre du status code par défaut.
function estUnNext(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

function estUneRedirectionVersConnexion(response: Response): boolean {
  return response.status === 307 && (response.headers.get("location") ?? "").includes("/connexion");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("proxy — route publique", () => {
  it("accessible sans aucune session (pas de cookies)", async () => {
    const request = buildRequest("/parcelles");

    const response = await proxy(request);

    expect(estUnNext(response)).toBe(true);
  });

  it("session expirée + refresh impossible => jamais de redirection (route publique)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const request = buildRequest("/parcelles", {
      access_token: fakeJWT(EXP_PASSE),
      refresh_token: "un-refresh-token",
    });

    const response = await proxy(request);

    expect(estUnNext(response)).toBe(true);
    expect(response.status).not.toBe(307);
    // Le refresh est bien tenté (par confort, pour le Navbar) — juste son
    // échec qui ne doit jamais se traduire par une redirection ici.
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/auth/refresh/`, expect.anything());
  });
});

describe("proxy — route protégée", () => {
  it("redirige vers /connexion sans aucune session", async () => {
    const request = buildRequest("/compte");

    const response = await proxy(request);

    expect(estUneRedirectionVersConnexion(response)).toBe(true);
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("next")).toBe("/compte");
  });

  it("access token valide => laisse passer sans tenter de refresh", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = buildRequest("/compte", { access_token: fakeJWT(EXP_FUTUR) });

    const response = await proxy(request);

    expect(estUnNext(response)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("JWT expiré + refresh possible => tente le refresh et laisse passer avec les nouveaux cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: [
          ["set-cookie", "access_token=nouvel-access; Path=/; HttpOnly"],
          ["set-cookie", "refresh_token=nouveau-refresh; Path=/api/auth/; HttpOnly"],
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = buildRequest("/compte", {
      access_token: fakeJWT(EXP_PASSE),
      refresh_token: "ancien-refresh-token",
    });

    const response = await proxy(request);

    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/auth/refresh/`, expect.anything());
    expect(estUnNext(response)).toBe(true);
    expect(response.cookies.get("access_token")?.value).toBe("nouvel-access");
    expect(response.cookies.get("refresh_token")?.value).toBe("nouveau-refresh");
  });

  it("refresh impossible (backend refuse) => redirige vers /connexion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const request = buildRequest("/compte", {
      access_token: fakeJWT(EXP_PASSE),
      refresh_token: "refresh-expire-ou-blackliste",
    });

    const response = await proxy(request);

    expect(estUneRedirectionVersConnexion(response)).toBe(true);
  });

  it("refresh impossible (aucun refresh_token) => redirige sans même appeler le backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = buildRequest("/compte", { access_token: fakeJWT(EXP_PASSE) });

    const response = await proxy(request);

    expect(estUneRedirectionVersConnexion(response)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refresh impossible (backend injoignable) => redirige, ne remonte jamais l'exception", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    const request = buildRequest("/compte", {
      access_token: fakeJWT(EXP_PASSE),
      refresh_token: "un-refresh-token",
    });

    const response = await proxy(request);

    expect(estUneRedirectionVersConnexion(response)).toBe(true);
  });
});

describe("proxy — les 5 routes protégées du contrat", () => {
  it.each(["/compte", "/compte/annonces", "/bienvenue", "/publier", "/messages", "/favoris"])(
    "%s exige une session",
    async (pathname) => {
      const request = buildRequest(pathname);

      const response = await proxy(request);

      expect(estUneRedirectionVersConnexion(response)).toBe(true);
    },
  );

  it.each(["/", "/parcelles", "/comparateur", "/connexion", "/inscription"])(
    "%s reste accessible sans session",
    async (pathname) => {
      const request = buildRequest(pathname);

      const response = await proxy(request);

      expect(estUnNext(response)).toBe(true);
    },
  );
});
