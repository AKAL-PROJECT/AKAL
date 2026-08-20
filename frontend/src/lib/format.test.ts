// formatPrixM2 (audit final du 20/08, P4) — Math.round(prix / surfaceM2)
// affichait "0 MAD/m²" (lu comme "gratuit") pour tout prix réel inférieur à
// 0,5 MAD/m², cf. lib/mapAnnonceToParcelle.ts::calculerPrixM2. Ces tests
// couvrent exactement les cas listés par l'audit : 0, < 1, = 1, > 1,
// surface invalide, prix invalide.

import { describe, expect, it } from "vitest";
import { formatMAD, formatPrixM2 } from "./format";

describe("formatPrixM2", () => {
  it("affiche 0 MAD/m² pour un prix nul", () => {
    expect(formatPrixM2(0)).toBe("0 MAD/m²");
  });

  it("affiche < 1 MAD/m² pour une valeur positive mais inférieure à 1 (cœur du correctif)", () => {
    // 170 MAD / 1,4 ha (14 000 m²) — cas réel constaté sur une annonce
    // scrapée, arrondi à tort à "0 MAD/m²" avant ce correctif.
    expect(formatPrixM2(170 / 14_000)).toBe("< 1 MAD/m²");
    expect(formatPrixM2(0.012)).toBe("< 1 MAD/m²");
    expect(formatPrixM2(0.99)).toBe("< 1 MAD/m²");
  });

  it("affiche la valeur arrondie pour exactement 1", () => {
    expect(formatPrixM2(1)).toBe("1 MAD/m²");
  });

  it("affiche la valeur arrondie, avec séparateur de milliers, pour une valeur > 1", () => {
    expect(formatPrixM2(9)).toBe("9 MAD/m²");
    expect(formatPrixM2(600)).toBe("600 MAD/m²");
    // 1234,6 arrondi à 1235 — délègue le séparateur de milliers à la même
    // instance formatMAD que le reste du fichier (formatage fr-MA partagé,
    // jamais reconstruit ici) plutôt que de deviner le caractère exact
    // utilisé par la locale (espace normale/insécable).
    expect(formatPrixM2(1234.6)).toBe(`${formatMAD.format(1235)} MAD/m²`);
  });

  it("ne produit jamais une valeur trompeuse pour une surface invalide (prixM2 négatif ou non fini)", () => {
    expect(formatPrixM2(-5)).toBe("0 MAD/m²");
    expect(formatPrixM2(NaN)).toBe("0 MAD/m²");
    expect(formatPrixM2(Infinity)).toBe("0 MAD/m²");
  });

  it("ne produit jamais une valeur trompeuse pour un prix invalide", () => {
    expect(formatPrixM2(-Infinity)).toBe("0 MAD/m²");
  });
});
