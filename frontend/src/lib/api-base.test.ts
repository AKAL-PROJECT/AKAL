import { afterEach, describe, expect, it, vi } from "vitest";

// api-base.ts résout API_URL au chargement du module (const de niveau module).
// On recharge donc le module après chaque changement d'environnement.
async function chargerApiUrl(): Promise<string> {
  vi.resetModules();
  return (await import("./api-base")).API_URL;
}

describe("api-base — résolution de l'URL de l'API", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("défaut : localhost:8000/api, sans slash final", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("API_URL_INTERNAL", "");
    expect(await chargerApiUrl()).toBe("http://localhost:8000/api");
  });

  it("navigateur : utilise NEXT_PUBLIC_API_URL même si API_URL_INTERNAL est défini", async () => {
    vi.stubGlobal("window", {}); // typeof window !== "undefined"
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://akal.example/api");
    vi.stubEnv("API_URL_INTERNAL", "http://backend:8000/api");
    expect(await chargerApiUrl()).toBe("https://akal.example/api");
  });

  it("serveur : utilise API_URL_INTERNAL quand il est défini", async () => {
    vi.stubGlobal("window", undefined); // typeof window === "undefined"
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:8000/api");
    vi.stubEnv("API_URL_INTERNAL", "http://backend:8000/api/");
    expect(await chargerApiUrl()).toBe("http://backend:8000/api");
  });

  it("serveur sans API_URL_INTERNAL : retombe sur la valeur publique", async () => {
    vi.stubGlobal("window", undefined);
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://akal.example/api");
    vi.stubEnv("API_URL_INTERNAL", "");
    expect(await chargerApiUrl()).toBe("https://akal.example/api");
  });
});
