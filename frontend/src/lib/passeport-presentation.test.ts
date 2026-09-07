import { describe, expect, it } from "vitest";
import type { Passeport, PasseportDimension } from "./passeport-api";
import {
  aRetenir,
  bandeScore,
  formatResolution,
  libelleAccesEau,
  PRESENTATION_DIMENSION,
  synthese,
  verdict,
} from "./passeport-presentation";

function dim(over: Partial<PasseportDimension> = {}): PasseportDimension {
  return {
    statut: "ok",
    mode: "reel",
    sousScore: 80,
    confiance: 0.8,
    valeurs: {},
    source: "s",
    dateCollecte: "2026-09-02T11:20:00Z",
    resolutionM: 30,
    zoneTamponM: 90,
    poidsNominal: 20,
    contribution: 16,
    ...over,
  };
}

function passeport(over: Partial<Passeport> = {}): Passeport {
  return {
    parcelleId: "p1",
    genereLe: "2026-09-02T11:20:00Z",
    mode: "reel",
    scoreGlobal: 69,
    fiabiliteGlobale: 80,
    dimensions: {
      sol: dim({ sousScore: 84 }),
      climat: dim({ sousScore: 67 }),
      ndvi: dim({ sousScore: 20 }),
      topo: dim({ sousScore: 100 }),
      acces: dim({ sousScore: 95 }),
    },
    dimensionsIndisponibles: [],
    culturesSuggerees: [
      { culture: "olivier", statut: "compatible", raison: "", reserve: "" },
      { culture: "amandier", statut: "compatible", raison: "", reserve: "" },
      { culture: "maraichage", statut: "deconseille", raison: "", reserve: "" },
    ],
    avertissement: "",
    ...over,
  };
}

describe("bandeScore", () => {
  it("seuils 70 / 45", () => {
    expect(bandeScore(85)).toEqual({ mot: "élevé", ton: "positif" });
    expect(bandeScore(70)).toEqual({ mot: "élevé", ton: "positif" });
    expect(bandeScore(50)).toEqual({ mot: "moyen", ton: "neutre" });
    expect(bandeScore(45)).toEqual({ mot: "moyen", ton: "neutre" });
    expect(bandeScore(30)).toEqual({ mot: "limité", ton: "reserve" });
  });
  it("null => indisponible", () => {
    expect(bandeScore(null)).toEqual({ mot: "indisponible", ton: "vide" });
  });
});

describe("verdict", () => {
  it("combine bande de score et accès eau", () => {
    expect(verdict(88, "irriguee")).toBe("Potentiel élevé — terrain irrigable");
    expect(verdict(50, "bour")).toBe("Potentiel moyen — terrain bour (pluvial)");
  });
  it("sans accès eau connu", () => {
    expect(verdict(88, null)).toBe("Potentiel élevé");
  });
  it("score null", () => {
    expect(verdict(null, "irriguee")).toBe("Potentiel indisponible — terrain irrigable");
  });
});

describe("formatResolution", () => {
  it("km au-delà de 1000 m, m en deçà, vide si null", () => {
    expect(formatResolution(11000)).toBe("11 km");
    expect(formatResolution(1500)).toBe("1.5 km");
    expect(formatResolution(250)).toBe("250 m");
    expect(formatResolution(null)).toBe("");
    expect(formatResolution(0)).toBe("");
  });
});

describe("libelleAccesEau", () => {
  it("mappe les 3 valeurs, vide sinon", () => {
    expect(libelleAccesEau("irriguee")).toBe("terrain irrigable");
    expect(libelleAccesEau("mixte")).toBe("terrain mixte");
    expect(libelleAccesEau(null)).toBe("");
  });
});

describe("synthese", () => {
  it("compte les cultures compatibles + point fort / vigilance", () => {
    const s = synthese(passeport());
    expect(s).toContain("2 cultures compatibles");
    expect(s).toContain("Point fort : relief (100/100)"); // topo = 100, le plus haut
    expect(s).toContain("Point de vigilance : végétation (20/100)"); // ndvi = 20, le plus bas
  });
  it("aucune culture compatible", () => {
    const s = synthese(passeport({ culturesSuggerees: [] }));
    expect(s).toContain("Aucune culture compatible");
  });
  it("ignore les dimensions indisponibles pour le point fort/faible", () => {
    const p = passeport({
      dimensions: {
        ...passeport().dimensions,
        ndvi: dim({ statut: "indisponible", sousScore: null }),
      },
    });
    const s = synthese(p);
    expect(s).toContain("Point de vigilance : climat (67/100)"); // ndvi exclu → climat le plus bas
  });
});

describe("aRetenir", () => {
  it("favorables, vigilance, non évalué, rappel labo", () => {
    const p = passeport({
      dimensions: {
        sol: dim({ sousScore: 84 }),
        climat: dim({ sousScore: 40 }),
        ndvi: dim({ statut: "indisponible", sousScore: null }),
        topo: dim({ sousScore: 100 }),
        acces: dim({ sousScore: 95 }),
      },
      dimensionsIndisponibles: ["ndvi"],
    });
    const puces = aRetenir(p);
    expect(puces.some((x) => x.startsWith("Dimensions favorables") && x.includes("sol"))).toBe(true);
    expect(puces.some((x) => x.startsWith("Point de vigilance") && x.includes("climat"))).toBe(true);
    expect(puces.some((x) => x.startsWith("Non évalué") && x.includes("végétation"))).toBe(true);
    expect(puces[puces.length - 1]).toContain("analyse de terrain ou de laboratoire");
  });
});

describe("PRESENTATION_DIMENSION", () => {
  it("sol — clés réelles (ph_eau, type_sol, fractions)", () => {
    const lignes = PRESENTATION_DIMENSION.sol({ ph_eau: 7.7, type_sol: "argileux", argile_pct: 38.4 });
    expect(lignes).toContainEqual({ label: "Type de sol", valeur: "argileux" });
    expect(lignes).toContainEqual({ label: "pH (eau)", valeur: "7.7" });
    expect(lignes).toContainEqual({ label: "Argile", valeur: "38.4 %" });
  });
  it("climat — température nullable", () => {
    const lignes = PRESENTATION_DIMENSION.climat({ pluviometrie_mm: 484, temperature_moyenne_c: null, periode: "1991-2020" });
    expect(lignes).toContainEqual({ label: "Pluviométrie annuelle", valeur: "484 mm" });
    expect(lignes).toContainEqual({ label: "Température moyenne", valeur: "—" });
  });
  it("ndvi — fenêtre reformattée", () => {
    const lignes = PRESENTATION_DIMENSION.ndvi({ ndvi_moyen: 0.341, mois_exploitables: 11, mois_total: 12, fenetre: "2024-03-01..2025-02-28" });
    expect(lignes).toContainEqual({ label: "NDVI moyen", valeur: "0.34" });
    expect(lignes).toContainEqual({ label: "Mois exploitables", valeur: "11 / 12" });
    expect(lignes).toContainEqual({ label: "Fenêtre analysée", valeur: "2024-03-01 → 2025-02-28" });
  });
  it("acces — distance formatée, valeurs manquantes => —", () => {
    expect(PRESENTATION_DIMENSION.acces({ distance_route_m: 76, route_nom: "N8" })).toContainEqual({
      label: "Distance à la route",
      valeur: "76 m",
    });
    expect(PRESENTATION_DIMENSION.acces({})).toContainEqual({ label: "Distance à la route", valeur: "—" });
  });
  it("tolère un dict valeurs vide (dimension indisponible)", () => {
    for (const cle of ["sol", "climat", "ndvi", "topo", "acces"] as const) {
      const lignes = PRESENTATION_DIMENSION[cle]({});
      expect(lignes.every((l) => typeof l.valeur === "string")).toBe(true);
    }
  });
});
