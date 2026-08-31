// Tests du générateur de Passeport Agronomique (P2-01, prototype).
//
// Ce qui compte ici : le déterminisme (jamais de random pur — cf. ticket
// §11), la cohérence interne des profils, et le fait que l'identification
// ne recopie que des données réellement présentes sur la Parcelle passée en
// entrée (jamais inventées).

import { describe, expect, it } from "vitest";
import { PROFILS, choisirProfil, genererPasseport } from "./passeportAgronomique";
import type { Parcelle } from "@/types/parcelle";

function parcelleFactice(overrides: Partial<Parcelle> = {}): Parcelle {
  return {
    id: "3f2b6c9e-8a41-4d2c-9f1e-7b5a2c8d4e10",
    slug: "parcelle-test",
    titre: "Parcelle de test",
    description: "",
    prix: 100_000,
    prixM2: 10,
    statut: "en_ligne",
    datePublication: null,
    createdAt: "2026-01-01T00:00:00Z",
    badge: null,
    parcelle: {
      surface: 5,
      statutFoncier: "melkia",
      accesEau: "irriguee",
      topographie: null,
      latitude: 33.5,
      longitude: -7.5,
      regionCode: "casablanca-settat",
      regionNom: "Casablanca-Settat",
      province: "Settat",
      commune: "Berrechid",
      adresseApproximative: "Berrechid, Maroc",
      contour: null,
    },
    scoreCourant: null,
    photoPrincipale: null,
    photos: [],
    ...overrides,
  };
}

describe("choisirProfil", () => {
  it("retourne toujours le même profil pour le même id (déterministe, jamais du random pur)", () => {
    const id = "3f2b6c9e-8a41-4d2c-9f1e-7b5a2c8d4e10";
    const profil1 = choisirProfil(id);
    const profil2 = choisirProfil(id);
    const profil3 = choisirProfil(id);
    expect(profil1).toBe(profil2);
    expect(profil2).toBe(profil3);
  });

  it("retourne un profil parmi la liste des 10 à 15 profils prédéfinis (§11 du ticket)", () => {
    expect(PROFILS.length).toBeGreaterThanOrEqual(10);
    expect(PROFILS.length).toBeLessThanOrEqual(15);
    const profil = choisirProfil("un-id-quelconque");
    expect(PROFILS).toContain(profil);
  });

  it("des id différents peuvent retomber sur des profils différents (pas une constante déguisée)", () => {
    const profils = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => choisirProfil(id).id),
    );
    expect(profils.size).toBeGreaterThan(1);
  });
});

describe("PROFILS (cohérence interne)", () => {
  it("chaque profil a un score global cohérent avec son niveau global déclaré", () => {
    for (const profil of PROFILS) {
      if (profil.niveauGlobal === "eleve") expect(profil.scoreGlobal).toBeGreaterThanOrEqual(60);
      if (profil.niveauGlobal === "moyen") expect(profil.scoreGlobal).toBeGreaterThanOrEqual(40);
      if (profil.niveauGlobal === "faible") expect(profil.scoreGlobal).toBeLessThan(60);
    }
  });

  it("aucune valeur négative ou hors plage plausible (ph, ndvi, pente)", () => {
    for (const profil of PROFILS) {
      expect(profil.sol.ph).toBeGreaterThan(0);
      expect(profil.sol.ph).toBeLessThan(14);
      expect(profil.ndvi.moyenne).toBeGreaterThanOrEqual(0);
      expect(profil.ndvi.moyenne).toBeLessThanOrEqual(1);
      expect(profil.topographie.pentePourcent).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("genererPasseport", () => {
  it("reprend l'identification depuis la Parcelle réelle, sans rien inventer", () => {
    const parcelle = parcelleFactice();
    const passeport = genererPasseport(parcelle);

    expect(passeport.identification.titre).toBe(parcelle.titre);
    expect(passeport.identification.region).toBe(parcelle.parcelle.regionNom);
    expect(passeport.identification.province).toBe(parcelle.parcelle.province);
    expect(passeport.identification.commune).toBe(parcelle.parcelle.commune);
    expect(passeport.identification.surfaceHa).toBe(parcelle.parcelle.surface);
    expect(passeport.identification.latitude).toBe(parcelle.parcelle.latitude);
    expect(passeport.identification.longitude).toBe(parcelle.parcelle.longitude);
  });

  it("ne prétend jamais avoir de contour réel (confidentialité, cf. types/parcelle.ts)", () => {
    const passeport = genererPasseport(parcelleFactice());
    expect(passeport.identification.contour).toBeNull();
  });

  it("les 5 agents sont tous présents et explicitement marqués simulés", () => {
    const passeport = genererPasseport(parcelleFactice());
    for (const agent of [passeport.sol, passeport.climat, passeport.ndvi, passeport.topographie, passeport.accessibilite]) {
      expect(agent.simule).toBe(true);
      expect(agent.source.length).toBeGreaterThan(0);
      expect(["elevee", "moyenne", "faible"]).toContain(agent.confiance);
    }
  });

  it("l'agent Sol et l'agent Topographie annoncent une résolution théorique, l'agent Climat n'en a pas (cohérent avec le document de référence)", () => {
    const passeport = genererPasseport(parcelleFactice());
    expect(passeport.sol.resolution).toBe("250 m");
    expect(passeport.ndvi.resolution).toBe("10 m");
    expect(passeport.topographie.resolution).toBe("30 m");
    expect(passeport.climat.resolution).toBeNull();
    expect(passeport.accessibilite.resolution).toBeNull();
  });

  it("génère le même profil pour la même parcelle à deux appels différents (stabilité écran ↔ PDF)", () => {
    const parcelle = parcelleFactice();
    const p1 = genererPasseport(parcelle);
    const p2 = genererPasseport(parcelle);
    expect(p1.profil.id).toBe(p2.profil.id);
    expect(p1.sol.valeurs).toEqual(p2.sol.valeurs);
  });
});
