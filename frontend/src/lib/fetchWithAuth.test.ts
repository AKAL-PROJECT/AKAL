// fetchWithAuth centralise le retry-on-401 : requête normale passthrough,
// 401 => refresh puis UNE seule relecture, refresh échoué => renvoie le 401
// d'origine sans jamais boucler. refreshAccessToken (lib/auth-refresh.ts)
// est mocké : ce test porte sur l'orchestration retry-unique elle-même, pas
// sur la persistance des cookies de refresh (hors périmètre, cf. son propre
// fichier). next/headers est mocké par un faux jar en mémoire, partagé entre
// tous les appels de cookies() du test — ce qui permet de vérifier qu'une
// mutation faite par refreshAccessToken (persist via cookies().set(), ici
// simulée) est bien relue par la requête rejouée, dans la même exécution.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { fetchWithAuth } from "./fetchWithAuth";
import { refreshAccessToken } from "./auth-refresh";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("./auth-refresh", () => ({
  refreshAccessToken: vi.fn(),
}));

const cookiesMock = vi.mocked(cookies);
const refreshAccessTokenMock = vi.mocked(refreshAccessToken);

// Faux jar en mémoire — mêmes méthodes que ReadonlyRequestCookies pour ce
// que fetchWithAuth en utilise (get/getAll/set).
function creerJar(initial: Record<string, string> = {}) {
  const magasin = new Map(Object.entries(initial));
  return {
    get: (name: string) => (magasin.has(name) ? { name, value: magasin.get(name)! } : undefined),
    getAll: () => Array.from(magasin.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      magasin.set(name, value);
    },
  };
}

function reponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("fetchWithAuth — requête normale", () => {
  it("200 => renvoie la réponse telle quelle, un seul appel fetch, pas de refresh tenté", async () => {
    cookiesMock.mockResolvedValue(creerJar({ access_token: "valide" }) as never);
    const fetchMock = vi.fn().mockResolvedValue(reponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithAuth("https://api.test/annonces/");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshAccessTokenMock).not.toHaveBeenCalled();
  });

  it("GET => pas de X-CSRFToken même si un cookie csrftoken est présent", async () => {
    cookiesMock.mockResolvedValue(creerJar({ access_token: "valide", csrftoken: "abc" }) as never);
    const fetchMock = vi.fn().mockResolvedValue(reponse(200));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithAuth("https://api.test/annonces/");

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["X-CSRFToken"]).toBeUndefined();
  });

  it("POST => X-CSRFToken ajouté depuis le cookie csrftoken, Cookie header inclut tous les cookies", async () => {
    cookiesMock.mockResolvedValue(creerJar({ access_token: "valide", csrftoken: "abc" }) as never);
    const fetchMock = vi.fn().mockResolvedValue(reponse(201));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithAuth("https://api.test/annonces/", { method: "POST" });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["X-CSRFToken"]).toBe("abc");
    expect(headers.Cookie).toContain("access_token=valide");
    expect(headers.Cookie).toContain("csrftoken=abc");
  });
});

describe("fetchWithAuth — 401 avec refresh réussi", () => {
  it("rejoue la requête UNE fois après un refresh réussi, renvoie la réponse rejouée", async () => {
    cookiesMock.mockResolvedValue(creerJar({ access_token: "perime" }) as never);
    const fetchMock = vi.fn().mockResolvedValueOnce(reponse(401)).mockResolvedValueOnce(reponse(200));
    vi.stubGlobal("fetch", fetchMock);
    refreshAccessTokenMock.mockResolvedValue(true);

    const res = await fetchWithAuth("https://api.test/annonces/");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
  });

  it("la requête rejouée relit les cookies à jour (nouveau access_token persisté par le refresh)", async () => {
    const jar = creerJar({ access_token: "perime" });
    cookiesMock.mockResolvedValue(jar as never);
    const fetchMock = vi.fn().mockResolvedValueOnce(reponse(401)).mockResolvedValueOnce(reponse(200));
    vi.stubGlobal("fetch", fetchMock);
    // Simule ce que refreshAccessToken() ferait réellement : persister le
    // nouveau cookie sur le même jar avant de résoudre.
    refreshAccessTokenMock.mockImplementation(async () => {
      jar.set("access_token", "tout-neuf");
      return true;
    });

    await fetchWithAuth("https://api.test/annonces/");

    const [, optionsRejeu] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((optionsRejeu.headers as Record<string, string>).Cookie).toContain("access_token=tout-neuf");
  });

  it("même si la requête rejouée échoue aussi (401), ne tente jamais un second refresh (pas de boucle)", async () => {
    cookiesMock.mockResolvedValue(creerJar({ access_token: "perime" }) as never);
    const fetchMock = vi.fn().mockResolvedValue(reponse(401)); // 401 à chaque appel
    vi.stubGlobal("fetch", fetchMock);
    refreshAccessTokenMock.mockResolvedValue(true);

    const res = await fetchWithAuth("https://api.test/annonces/");

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2); // requête initiale + une seule relecture
    expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1); // jamais un second refresh
  });
});

describe("fetchWithAuth — 401 avec refresh échoué", () => {
  it("session réellement terminée => renvoie le 401 d'origine, ne rejoue jamais la requête", async () => {
    cookiesMock.mockResolvedValue(creerJar({}) as never); // pas de refresh_token
    const fetchMock = vi.fn().mockResolvedValue(reponse(401));
    vi.stubGlobal("fetch", fetchMock);
    refreshAccessTokenMock.mockResolvedValue(false);

    const res = await fetchWithAuth("https://api.test/annonces/");

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1); // aucune relecture tentée
    expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
  });
});
