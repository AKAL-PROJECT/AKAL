import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIMENSIONS,
  getPasseport,
  mapPasseport,
  PasseportIndisponibleError,
} from "./passeport-api";

// DTO minimal mais complet (5 dimensions), forme du back (agriscore/orchestrateur).
function dtoDimension(over: Partial<Record<string, unknown>> = {}) {
  return {
    statut: "ok",
    mode: "reel",
    sous_score: 80,
    confiance: 0.8,
    valeurs: { exemple: 1 },
    source: "source-test",
    date_collecte: "2026-09-02T11:20:00Z",
    resolution_m: 30,
    zone_tampon_m: 90,
    poids_nominal: 20,
    contribution: 16,
    ...over,
  };
}

function dtoPasseport(over: Partial<Record<string, unknown>> = {}) {
  return {
    parcelle_id: "a1c4e7f0-2b5d-4e8a-b3c6-d9f2a5b8c1e4",
    genere_le: "2026-09-02T11:20:00Z",
    mode: "reel",
    score_global: 68.9,
    fiabilite_globale: 80,
    dimensions: {
      sol: dtoDimension({ valeurs: { ph_eau: 7.7, type_sol: "argileux" } }),
      climat: dtoDimension({ valeurs: { pluviometrie_mm: 484 } }),
      ndvi: dtoDimension({ valeurs: { ndvi_moyen: 0.34 } }),
      topo: dtoDimension({ valeurs: { pente_pct: 1.8 } }),
      acces: dtoDimension({ valeurs: { distance_route_m: 76 } }),
    },
    dimensions_indisponibles: [],
    cultures_suggerees: [
      { culture: "olivier", statut: "compatible", raison: "sol favorable", reserve: "sous vérification terrain" },
    ],
    avertissement: "",
    ...over,
  };
}

function reponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("mapPasseport", () => {
  it("convertit snake_case → camelCase et indexe les 5 dimensions", () => {
    const p = mapPasseport(dtoPasseport() as never);

    expect(p.parcelleId).toBe("a1c4e7f0-2b5d-4e8a-b3c6-d9f2a5b8c1e4");
    expect(p.genereLe).toBe("2026-09-02T11:20:00Z");
    expect(p.scoreGlobal).toBe(68.9);
    expect(p.fiabiliteGlobale).toBe(80);
    expect(Object.keys(p.dimensions).sort()).toEqual([...DIMENSIONS].sort());
    expect(p.dimensions.sol.sousScore).toBe(80);
    expect(p.dimensions.sol.dateCollecte).toBe("2026-09-02T11:20:00Z");
    expect(p.dimensions.sol.resolutionM).toBe(30);
    expect(p.dimensions.sol.zoneTamponM).toBe(90);
    expect(p.dimensions.sol.valeurs).toEqual({ ph_eau: 7.7, type_sol: "argileux" });
  });

  it("mappe les cultures suggérées", () => {
    const p = mapPasseport(dtoPasseport() as never);
    expect(p.culturesSuggerees).toEqual([
      { culture: "olivier", statut: "compatible", raison: "sol favorable", reserve: "sous vérification terrain" },
    ]);
  });

  it("passeport partiel : dimensionsIndisponibles + dimension indisponible", () => {
    const dto = dtoPasseport({
      mode: "reel",
      dimensions_indisponibles: ["topo"],
      avertissement: "Passeport partiel : relief indisponible(s).",
      dimensions: {
        ...dtoPasseport().dimensions,
        topo: dtoDimension({ statut: "indisponible", sous_score: null, confiance: 0, valeurs: null, contribution: 0 }),
      },
    });
    const p = mapPasseport(dto as never);

    expect(p.dimensionsIndisponibles).toEqual(["topo"]);
    expect(p.dimensions.topo.statut).toBe("indisponible");
    expect(p.dimensions.topo.sousScore).toBeNull();
    expect(p.dimensions.topo.valeurs).toEqual({}); // null → {} (jamais undefined)
    expect(p.avertissement).toContain("partiel");
  });

  it("score_global null (aucune dimension exploitable) est préservé", () => {
    const p = mapPasseport(dtoPasseport({ score_global: null }) as never);
    expect(p.scoreGlobal).toBeNull();
  });
});

describe("getPasseport", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mockFetch = () => fetch as unknown as ReturnType<typeof vi.fn>;

  it("200 → Passeport mappé, URL /parcelles/<id>/passeport/", async () => {
    mockFetch().mockResolvedValue(reponse(dtoPasseport()));

    const p = await getPasseport("PARC-1");

    expect(p.mode).toBe("reel");
    expect(p.dimensions.sol.valeurs.ph_eau).toBe(7.7);
    const url = String(mockFetch().mock.calls[0][0]);
    expect(url).toMatch(/\/parcelles\/PARC-1\/passeport\/$/);
  });

  it("422 → PasseportIndisponibleError('non_geolocalisee')", async () => {
    mockFetch().mockResolvedValue(reponse({ detail: "Parcelle non géolocalisée." }, 422));
    await expect(getPasseport("PARC-1")).rejects.toMatchObject({
      name: "PasseportIndisponibleError",
      raison: "non_geolocalisee",
    });
  });

  it("404 → PasseportIndisponibleError('introuvable')", async () => {
    mockFetch().mockResolvedValue(reponse({ detail: "Not found." }, 404));
    await expect(getPasseport("PARC-1")).rejects.toMatchObject({ raison: "introuvable" });
  });

  it("500 → PasseportIndisponibleError('erreur')", async () => {
    mockFetch().mockResolvedValue(reponse({ detail: "boom" }, 500));
    await expect(getPasseport("PARC-1")).rejects.toMatchObject({ raison: "erreur" });
  });

  it("fetch qui rejette (réseau) → PasseportIndisponibleError('erreur')", async () => {
    mockFetch().mockRejectedValue(new Error("hors ligne"));
    const erreur = await getPasseport("PARC-1").catch((e) => e);
    expect(erreur).toBeInstanceOf(PasseportIndisponibleError);
    expect(erreur.raison).toBe("erreur");
  });
});
