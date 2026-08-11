// Server Actions du dépôt d'annonce — "données envoyées correctement à
// l'API" : lib/annonces-api.ts (creerBrouillon/patchBrouillon) est mocké,
// ce test vérifie exactement la transformation FormData -> shape d'appel,
// pas l'intégration réseau réelle (déjà couverte côté fetch dans le lib).
// Fonctions serveur pures, pas de DOM (environment "node" par défaut).

import { afterEach, describe, expect, it, vi } from "vitest";
import { enregistrerInfosGeneralesAction, enregistrerLocalisationAction } from "./depot-annonce";
import { creerBrouillon, patchBrouillon } from "@/lib/annonces-api";
import { ApiError } from "@/lib/api";
import type { AnnonceEcriture } from "@/types/depot-annonce";

vi.mock("@/lib/annonces-api", () => ({
  creerBrouillon: vi.fn(),
  patchBrouillon: vi.fn(),
  uploaderPhotos: vi.fn(),
  supprimerPhoto: vi.fn(),
  getBrouillon: vi.fn(),
}));

const creerBrouillonMock = vi.mocked(creerBrouillon);
const patchBrouillonMock = vi.mocked(patchBrouillon);

afterEach(() => {
  vi.resetAllMocks();
});

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

// Seule l'id nous importe dans ces tests — le reste du shape retourné
// n'est jamais inspecté (ces actions ne font que relayer ce que l'API renvoie).
const ANNONCE_RETOURNEE = { id: "annonce-1" } as AnnonceEcriture;

describe("enregistrerInfosGeneralesAction — données envoyées à l'API", () => {
  it("sans id => creerBrouillon() (POST), avec le bon shape et les bons types", async () => {
    creerBrouillonMock.mockResolvedValue(ANNONCE_RETOURNEE);

    const result = await enregistrerInfosGeneralesAction(
      null,
      formData({
        titre: "Belle parcelle",
        description: "Une description suffisamment longue.",
        prix_mad: "150000",
        surface_ha: "2.5",
        statut_foncier: "melkia",
        acces_eau: "irriguee",
        topographie: "plat",
        acces_routier: "goudron",
        loc_confidentielle: "on",
      }),
    );

    expect(creerBrouillonMock).toHaveBeenCalledWith({
      titre: "Belle parcelle",
      description: "Une description suffisamment longue.",
      prix_mad: 150000, // number, pas la string du formulaire
      loc_confidentielle: true, // "on" -> true
      parcelle: {
        surface_ha: 2.5, // number
        statut_foncier: "melkia",
        acces_eau: "irriguee",
        topographie: "plat",
        acces_routier: "goudron",
      },
    });
    expect(patchBrouillonMock).not.toHaveBeenCalled();
    expect(result?.annonce).toBe(ANNONCE_RETOURNEE);
  });

  it("avec id => patchBrouillon(id, ...) au lieu de créer", async () => {
    patchBrouillonMock.mockResolvedValue(ANNONCE_RETOURNEE);

    await enregistrerInfosGeneralesAction(
      null,
      formData({
        id: "annonce-existante",
        titre: "Titre modifié",
        description: "Description modifiée, suffisamment longue.",
        prix_mad: "200000",
        surface_ha: "3",
        statut_foncier: "soulaliya",
        acces_eau: "bour",
        topographie: "pentu",
        acces_routier: "piste",
      }),
    );

    expect(patchBrouillonMock).toHaveBeenCalledWith(
      "annonce-existante",
      expect.objectContaining({ titre: "Titre modifié" }),
    );
    expect(creerBrouillonMock).not.toHaveBeenCalled();
  });

  it("case 'loc_confidentielle' décochée (absente du formulaire) => false, jamais undefined", async () => {
    creerBrouillonMock.mockResolvedValue(ANNONCE_RETOURNEE);

    await enregistrerInfosGeneralesAction(
      null,
      formData({
        titre: "T",
        description: "Description suffisamment longue.",
        prix_mad: "1",
        surface_ha: "1",
        statut_foncier: "melkia",
        acces_eau: "irriguee",
        topographie: "plat",
        acces_routier: "goudron",
      }),
    );

    expect(creerBrouillonMock).toHaveBeenCalledWith(expect.objectContaining({ loc_confidentielle: false }));
  });

  it("erreur API => renvoie error + fieldErrors, jamais d'exception non gérée", async () => {
    creerBrouillonMock.mockRejectedValue(
      new ApiError(400, "Titre déjà utilisé.", { titre: ["Titre déjà utilisé."] }),
    );

    const result = await enregistrerInfosGeneralesAction(
      null,
      formData({
        titre: "",
        description: "",
        prix_mad: "0",
        surface_ha: "0",
        statut_foncier: "",
        acces_eau: "",
        topographie: "",
        acces_routier: "",
      }),
    );

    expect(result).toEqual({
      annonce: null,
      error: "Titre déjà utilisé.",
      fieldErrors: { titre: ["Titre déjà utilisé."] },
    });
  });

  it("erreur réseau (pas une ApiError) => message générique, jamais l'exception brute", async () => {
    creerBrouillonMock.mockRejectedValue(new TypeError("fetch failed"));

    const result = await enregistrerInfosGeneralesAction(
      null,
      formData({
        titre: "T",
        description: "D",
        prix_mad: "1",
        surface_ha: "1",
        statut_foncier: "melkia",
        acces_eau: "irriguee",
        topographie: "plat",
        acces_routier: "goudron",
      }),
    );

    expect(result?.error).toBe("Une erreur est survenue. Réessayez.");
    expect(result?.annonce).toBeNull();
  });
});

describe("enregistrerLocalisationAction — données envoyées à l'API", () => {
  it("convertit commune_geom/latitude/longitude en nombres, parse le contour", async () => {
    patchBrouillonMock.mockResolvedValue(ANNONCE_RETOURNEE);

    await enregistrerLocalisationAction(
      null,
      formData({
        id: "annonce-1",
        commune_geom: "42",
        latitude: "33.5",
        longitude: "-5.5",
        contour: JSON.stringify([
          { latitude: 1, longitude: 2 },
          { latitude: 3, longitude: 4 },
        ]),
      }),
    );

    expect(patchBrouillonMock).toHaveBeenCalledWith("annonce-1", {
      parcelle: {
        commune_geom: 42,
        latitude: 33.5,
        longitude: -5.5,
        contour: [
          { latitude: 1, longitude: 2 },
          { latitude: 3, longitude: 4 },
        ],
      },
    });
  });

  it("commune_geom/latitude/longitude vides => null, jamais NaN ni 0", async () => {
    patchBrouillonMock.mockResolvedValue(ANNONCE_RETOURNEE);

    await enregistrerLocalisationAction(
      null,
      formData({ id: "annonce-1", commune_geom: "", latitude: "", longitude: "", contour: "[]" }),
    );

    expect(patchBrouillonMock).toHaveBeenCalledWith("annonce-1", {
      parcelle: { commune_geom: null, latitude: null, longitude: null, contour: [] },
    });
  });

  it("contour illisible (JSON invalide) => repli sur [], jamais d'exception", async () => {
    patchBrouillonMock.mockResolvedValue(ANNONCE_RETOURNEE);

    await enregistrerLocalisationAction(
      null,
      formData({ id: "annonce-1", commune_geom: "1", latitude: "1", longitude: "1", contour: "{pas du json valide" }),
    );

    expect(patchBrouillonMock).toHaveBeenCalledWith(
      "annonce-1",
      expect.objectContaining({ parcelle: expect.objectContaining({ contour: [] }) }),
    );
  });
});
