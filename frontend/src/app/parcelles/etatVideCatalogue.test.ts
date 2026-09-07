import { describe, expect, it } from "vitest";
import { FILTRES_INITIAUX, type FiltresState, type Region } from "@/data/parcelles";
import { etatVideCatalogue, patchElargissement } from "./etatVideCatalogue";

const REGIONS: Region[] = [
  { code: "fes-meknes", nom: "Fès-Meknès" },
  { code: "souss-massa", nom: "Souss-Massa" },
];

const f = (patch: Partial<FiltresState>): FiltresState => ({ ...FILTRES_INITIAUX, ...patch });

describe("etatVideCatalogue — cran d'élargissement", () => {
  it("commune sélectionnée → propose d'élargir à la province", () => {
    const e = etatVideCatalogue(f({ region: "fes-meknes", province: "341", commune: "4798" }), REGIONS);
    expect(e.elargir).toBe("commune");
    expect(e.titre).toBe("Aucune annonce dans cette commune");
    expect(e.description).toMatch(/province/i);
    expect(patchElargissement(e.elargir)).toEqual({ commune: "" });
  });

  it("province sélectionnée (sans commune) → propose d'élargir à la région", () => {
    const e = etatVideCatalogue(f({ region: "fes-meknes", province: "316" }), REGIONS);
    expect(e.elargir).toBe("province");
    expect(e.titre).toBe("Aucune annonce dans cette province");
    expect(patchElargissement(e.elargir)).toEqual({ province: "", commune: "" });
  });

  it("région seule → propose de voir toutes les régions, titre nommé", () => {
    const e = etatVideCatalogue(f({ region: "souss-massa" }), REGIONS);
    expect(e.elargir).toBe("region");
    expect(e.titre).toBe("Aucune annonce dans la région Souss-Massa");
    expect(patchElargissement(e.elargir)).toEqual({ region: "", province: "", commune: "" });
  });

  it("région inconnue du référentiel → titre générique", () => {
    const e = etatVideCatalogue(f({ region: "region-inconnue" }), REGIONS);
    expect(e.titre).toBe("Aucune annonce dans cette région");
  });

  it("aucun filtre géo → pas de cran d'élargissement", () => {
    const e = etatVideCatalogue(f({ prixMax: 100 }), REGIONS);
    expect(e.elargir).toBeNull();
    expect(patchElargissement(e.elargir)).toEqual({});
  });
});

describe("etatVideCatalogue — lien secondaire 'réinitialiser tous les filtres'", () => {
  it("actif quand un filtre non-géo est présent en plus de la géo", () => {
    expect(etatVideCatalogue(f({ province: "316", prixMax: 100 }), REGIONS).autreFiltreActif).toBe(true);
    expect(etatVideCatalogue(f({ commune: "4798", eau: "irriguee" }), REGIONS).autreFiltreActif).toBe(true);
    expect(etatVideCatalogue(f({ region: "fes-meknes", recherche: "olivier" }), REGIONS).autreFiltreActif).toBe(true);
  });

  it("inactif quand seule la cascade géo est utilisée", () => {
    expect(etatVideCatalogue(f({ region: "fes-meknes", province: "316", commune: "4798" }), REGIONS).autreFiltreActif).toBe(false);
  });
});
