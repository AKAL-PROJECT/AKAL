// Test de non-régression du contrat DTO → Parcelle.
//
// Fixture détail : JSON exact de AKAL_Contrat_Donnees_v1.2.md §4.4
// (branche origin/docs/contrat-donnees-charte-nommage). Fixture liste :
// dérivée du même exemple selon la règle "sous-ensemble allégé" énoncée
// juste après le JSON dans le contrat (id, slug, titre, prix_mad, statut,
// parcelle sans adresse_approximative, score_courant.score_global seul,
// photo_principale, created_at).
//
// Volontairement : ce test tourne contre un JSON figé, jamais contre l'API
// réelle (pas de fetch, pas de MSW) — c'est un test de mapping pur.

import { describe, expect, it } from "vitest";
import {
  mapAnnonceDetailToParcelle,
  mapAnnonceToParcelle,
  type AnnonceDetailDTO,
  type AnnonceListDTO,
} from "./mapAnnonceToParcelle";

// ── Fixture détail — GET /api/annonces/<slug>/ (contrat §4.4, verbatim) ─────
const ANNONCE_DETAIL_DTO: AnnonceDetailDTO = {
  id: "3f2b6c9e-8a41-4d2c-9f1e-7b5a2c8d4e10",
  slug: "parcelle-5ha-berrechid-agrumes",
  titre: "Parcelle agricole 5 ha — Berrechid",
  description: "Terrain agricole irrigué, exposition sud…",
  prix_mad: 450000,
  statut: "en_ligne",
  date_publication: "2026-06-01T09:30:00Z",
  parcelle: {
    id: "a1c4e7f0-2b5d-4e8a-b3c6-d9f2a5b8c1e4",
    surface_ha: 5.0,
    statut_foncier: "melkia",
    acces_eau: "irriguee",
    region: { code: "casablanca-settat", nom: "Casablanca-Settat" },
    localisation: {
      latitude: 33.2653,
      longitude: -7.5878,
      adresse_approximative: "Berrechid, Maroc",
    },
  },
  score_courant: {
    score_global: 78,
    sous_scores: {
      fertilite: 82,
      situation_hydrique: 70,
      accessibilite: 75,
      situation_juridique: 80,
      potentiel_valorisation: 76,
    },
    version_ponderation: "v1.0",
  },
  photos: [
    {
      id: "b2d5f8a1-3c6e-4f9b-a4d7-e0a3b6c9d2f5",
      url: "https://media.akal.ma/annonces/3f2b6c9e/photo-0.webp",
      ordre: 0,
    },
  ],
  proprietaire: { id: "c3e6a9b2-4d7f-4a0c-b5e8-f1b4c7d0e3a6", telephone_masque: null },
  created_at: "2026-05-28T14:12:00Z",
  updated_at: "2026-06-01T09:30:00Z",
};

describe("mapAnnonceDetailToParcelle (détail — fixture §4.4 verbatim)", () => {
  it("mappe le DTO détail vers le type front Parcelle", () => {
    const resultat = mapAnnonceDetailToParcelle(ANNONCE_DETAIL_DTO);

    expect(resultat).toEqual({
      id: "3f2b6c9e-8a41-4d2c-9f1e-7b5a2c8d4e10",
      slug: "parcelle-5ha-berrechid-agrumes",
      titre: "Parcelle agricole 5 ha — Berrechid",
      description: "Terrain agricole irrigué, exposition sud…",
      prix: 450000,
      prixM2: 9, // 450000 / (5.00 * 10 000 m²)
      statut: "en_ligne",
      datePublication: "2026-06-01T09:30:00Z",
      createdAt: "2026-05-28T14:12:00Z",
      badge: null, // création ancienne par rapport à "maintenant"
      parcelle: {
        surface: 5,
        statutFoncier: "melkia",
        accesEau: "irriguee",
        topographie: null,
        latitude: 33.2653,
        longitude: -7.5878,
        regionCode: "casablanca-settat",
        regionNom: "Casablanca-Settat",
        province: null, // absent de la fixture (verbatim contrat v1.2, cf. mapAnnonceToParcelle.ts)
        commune: null,
        adresseApproximative: "Berrechid, Maroc",
        contour: null,
      },
      scoreCourant: {
        scoreGlobal: 78,
        sousScores: {
          fertilite: 82,
          situation_hydrique: 70,
          accessibilite: 75,
          situation_juridique: 80,
          potentiel_valorisation: 76,
        },
        versionPonderation: "v1.0",
      },
      photoPrincipale: "https://media.akal.ma/annonces/3f2b6c9e/photo-0.webp",
      photos: ["https://media.akal.ma/annonces/3f2b6c9e/photo-0.webp"],
      proprietaire: { id: "c3e6a9b2-4d7f-4a0c-b5e8-f1b4c7d0e3a6", telephoneMasque: null },
    });
  });

  it("scoreCourant est null quand aucun AgriScore n'a encore été calculé", () => {
    const dto: AnnonceDetailDTO = { ...ANNONCE_DETAIL_DTO, score_courant: null };
    expect(mapAnnonceDetailToParcelle(dto).scoreCourant).toBeNull();
  });

  it("photos vide => photoPrincipale null, jamais d'erreur", () => {
    const dto: AnnonceDetailDTO = { ...ANNONCE_DETAIL_DTO, photos: [] };
    const resultat = mapAnnonceDetailToParcelle(dto);
    expect(resultat.photos).toEqual([]);
    expect(resultat.photoPrincipale).toBeNull();
  });

  it('calcule le badge "Nouveau" pour une création récente (< 1 semaine)', () => {
    const hier = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const dto: AnnonceDetailDTO = { ...ANNONCE_DETAIL_DTO, created_at: hier };
    expect(mapAnnonceDetailToParcelle(dto).badge).toBe("Nouveau");
  });
});

// ── Fixture liste — GET /api/annonces/ (dérivée du même exemple selon la
// règle "sous-ensemble allégé" du contrat §4.4) ──────────────────────────────
const ANNONCE_LISTE_DTO: AnnonceListDTO = {
  id: "3f2b6c9e-8a41-4d2c-9f1e-7b5a2c8d4e10",
  slug: "parcelle-5ha-berrechid-agrumes",
  titre: "Parcelle agricole 5 ha — Berrechid",
  prix_mad: 450000,
  statut: "en_ligne",
  parcelle: {
    id: "a1c4e7f0-2b5d-4e8a-b3c6-d9f2a5b8c1e4",
    surface_ha: 5.0,
    statut_foncier: "melkia",
    acces_eau: "irriguee",
    region: { code: "casablanca-settat", nom: "Casablanca-Settat" },
    // Pas d'adresse_approximative en liste (allégé, §4.4).
    localisation: { latitude: 33.2653, longitude: -7.5878 },
  },
  // Allégé à score_global seul (§4.4).
  score_courant: { score_global: 78 },
  photo_principale: "https://media.akal.ma/annonces/3f2b6c9e/photo-0.webp",
  created_at: "2026-05-28T14:12:00Z",
};

describe("mapAnnonceToParcelle (liste — sous-ensemble allégé)", () => {
  it("mappe le DTO liste vers le type front Parcelle", () => {
    const resultat = mapAnnonceToParcelle(ANNONCE_LISTE_DTO);

    expect(resultat).toEqual({
      id: "3f2b6c9e-8a41-4d2c-9f1e-7b5a2c8d4e10",
      slug: "parcelle-5ha-berrechid-agrumes",
      titre: "Parcelle agricole 5 ha — Berrechid",
      description: "", // non exposé en liste
      prix: 450000,
      prixM2: 9,
      statut: "en_ligne",
      datePublication: null, // absent en liste
      createdAt: "2026-05-28T14:12:00Z",
      badge: null,
      parcelle: {
        surface: 5,
        statutFoncier: "melkia",
        accesEau: "irriguee",
        topographie: null,
        latitude: 33.2653,
        longitude: -7.5878,
        regionCode: "casablanca-settat",
        regionNom: "Casablanca-Settat",
        province: null, // absent en liste
        commune: null,
        adresseApproximative: null, // absent en liste
        contour: null,
      },
      scoreCourant: {
        scoreGlobal: 78,
        sousScores: null, // allégé en liste
        versionPonderation: null, // allégé en liste
      },
      photoPrincipale: "https://media.akal.ma/annonces/3f2b6c9e/photo-0.webp",
      photos: [],
    });
  });

  it("scoreCourant est null quand aucun score n'existe encore", () => {
    const dto: AnnonceListDTO = { ...ANNONCE_LISTE_DTO, score_courant: null };
    expect(mapAnnonceToParcelle(dto).scoreCourant).toBeNull();
  });

  it("convertit prix_mad / surface_ha correctement même si le JSON renvoie déjà des number", () => {
    const resultat = mapAnnonceToParcelle(ANNONCE_LISTE_DTO);
    expect(typeof resultat.prix).toBe("number");
    expect(typeof resultat.parcelle.surface).toBe("number");
  });

  it('calcule le badge "Nouveau" à partir de created_at (date_publication absente en liste)', () => {
    const hier = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const dto: AnnonceListDTO = { ...ANNONCE_LISTE_DTO, created_at: hier };
    expect(mapAnnonceToParcelle(dto).badge).toBe("Nouveau");
  });
});
