// En-têtes BFF → Django (audit S1/S2) : Origin toujours présent (CSRF en
// HTTPS), IP visiteur transmise seulement avec le secret partagé, et jamais
// l'entrée X-Forwarded-For la plus à gauche (forgeable par le client).
import { afterEach, describe, expect, it, vi } from "vitest";
import { entetesBackend, ipClient } from "./entetes-backend";

function entetes(valeurs: Record<string, string>) {
  return new Headers(valeurs);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("entetesBackend", () => {
  it("pose toujours Origin, même sans secret", () => {
    vi.stubEnv("AKAL_PROXY_SECRET", "");
    const h = entetesBackend(entetes({ "x-forwarded-for": "1.2.3.4" }));
    expect(h.Origin).toMatch(/^https?:\/\//);
    expect(h["X-Akal-Proxy-Secret"]).toBeUndefined();
    expect(h["X-Akal-Client-IP"]).toBeUndefined();
  });

  it("transmet secret + IP visiteur quand le secret est configuré", () => {
    vi.stubEnv("AKAL_PROXY_SECRET", "s3cret");
    const h = entetesBackend(entetes({ "x-forwarded-for": "1.2.3.4" }));
    expect(h["X-Akal-Proxy-Secret"]).toBe("s3cret");
    expect(h["X-Akal-Client-IP"]).toBe("1.2.3.4");
  });

  it("sans requête entrante (SSR public) : secret mais pas d'IP", () => {
    vi.stubEnv("AKAL_PROXY_SECRET", "s3cret");
    const h = entetesBackend(null);
    expect(h["X-Akal-Proxy-Secret"]).toBe("s3cret");
    expect(h["X-Akal-Client-IP"]).toBeUndefined();
  });
});

describe("ipClient", () => {
  it("retient l'adresse ajoutée par le proxy de confiance, pas celle forgée à gauche", () => {
    vi.stubEnv("AKAL_TRUSTED_PROXY_COUNT", "1");
    expect(ipClient(entetes({ "x-forwarded-for": "6.6.6.6, 5.5.5.5" }))).toBe("5.5.5.5");
  });

  it("rejette une valeur qui n'a pas la forme d'une IP", () => {
    expect(ipClient(entetes({ "x-forwarded-for": "<script>" }))).toBeNull();
  });

  it("se replie sur x-real-ip", () => {
    expect(ipClient(entetes({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });
});
