import { describe, expect, it } from "vitest";
import { estSourceExterne, libelleSource } from "./annonce-source";

describe("estSourceExterne", () => {
  it("interne => false (messagerie AKAL + WhatsApp)", () => {
    expect(estSourceExterne("interne")).toBe(false);
  });

  it("undefined / null => false (défaut : ne rien masquer)", () => {
    expect(estSourceExterne(undefined)).toBe(false);
    expect(estSourceExterne(null)).toBe(false);
  });

  it("avito / mubawab / autre => true (CTA AKAL masqué)", () => {
    expect(estSourceExterne("avito")).toBe(true);
    expect(estSourceExterne("mubawab")).toBe(true);
    expect(estSourceExterne("autre-plateforme")).toBe(true);
  });
});

describe("libelleSource", () => {
  it("mappe les sources connues, repli générique sinon", () => {
    expect(libelleSource("avito")).toBe("Avito");
    expect(libelleSource("mubawab")).toBe("Mubawab");
    expect(libelleSource("xyz")).toBe("une source externe");
    expect(libelleSource(undefined)).toBe("une source externe");
  });
});
