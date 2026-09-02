// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PasseportAgronomiqueScreen from "./PasseportAgronomiqueScreen";
import { getPasseport } from "@/lib/passeport-api";
import type { Passeport, PasseportDimension } from "@/lib/passeport-api";
import type { Parcelle } from "@/types/parcelle";

vi.mock("@/lib/passeport-api", async (importReal) => {
  const real = await importReal<typeof import("@/lib/passeport-api")>();
  return { ...real, getPasseport: vi.fn() };
});
vi.mock("./CarteLeafletFiche", () => ({ default: () => <div data-testid="carte" /> }));

const getPasseportMock = vi.mocked(getPasseport);

afterEach(() => vi.clearAllMocks());

const PARCELLE = {
  id: "annonce-1",
  slug: "terrain-12ha-chichaoua",
  titre: "Terrain agricole 12 ha",
  parcelle: {
    id: "a1c4e7f0-2b5d-4e8a-b3c6-d9f2a5b8c1e4",
    surface: 12,
    statutFoncier: "immatricule",
    accesEau: "irriguee",
    topographie: null,
    latitude: 31.5432,
    longitude: -8.7621,
    regionCode: "marrakech-safi",
    regionNom: "Marrakech-Safi",
    province: "Chichaoua",
    commune: "Chichaoua",
    adresseApproximative: "Chichaoua, Maroc",
    contour: null,
  },
} as unknown as Parcelle;

function dim(over: Partial<PasseportDimension> = {}): PasseportDimension {
  return {
    statut: "ok",
    mode: "reel",
    sousScore: 80,
    confiance: 0.8,
    valeurs: {},
    source: "SoilGrids",
    dateCollecte: "2026-09-02T11:20:00Z",
    resolutionM: 250,
    zoneTamponM: 100,
    poidsNominal: 20,
    contribution: 16,
    ...over,
  };
}

function passeport(over: Partial<Passeport> = {}): Passeport {
  return {
    parcelleId: PARCELLE.parcelle.id,
    genereLe: "2026-09-02T11:20:00Z",
    mode: "reel",
    scoreGlobal: 88,
    fiabiliteGlobale: 80,
    dimensions: {
      sol: dim({ valeurs: { ph_eau: 6.8, type_sol: "argilo-limoneux" } }),
      climat: dim({ sousScore: 67, valeurs: { pluviometrie_mm: 480, periode: "1991-2020" } }),
      ndvi: dim({ sousScore: 55, valeurs: { ndvi_moyen: 0.68 } }),
      topo: dim({ sousScore: 100, valeurs: { pente_pct: 2, altitude_m: 340 } }),
      acces: dim({ sousScore: 95, valeurs: { distance_route_m: 250, route_nom: "N8" } }),
    },
    dimensionsIndisponibles: [],
    culturesSuggerees: [
      { culture: "olivier", statut: "compatible", raison: "sol favorable", reserve: "" },
    ],
    avertissement: "",
    ...over,
  };
}

// Promesse jamais résolue → l'état reste "chargement".
const jamais = () => new Promise<Passeport>(() => {});

describe("PasseportAgronomiqueScreen", () => {
  it("rend la coquille immédiatement (titre, identification, méthodologie)", () => {
    getPasseportMock.mockImplementation(jamais);
    render(<PasseportAgronomiqueScreen parcelle={PARCELLE} />);

    expect(screen.getByRole("heading", { name: "Terrain agricole 12 ha" })).toBeInTheDocument();
    expect(screen.getByText("Identification de la parcelle")).toBeInTheDocument();
    expect(screen.getByText("Limites et méthodologie")).toBeInTheDocument();
    expect(screen.getByText("A1C4E7F0")).toBeInTheDocument(); // référence = 8 premiers du UUID
  });

  it("chargement → skeleton", () => {
    getPasseportMock.mockImplementation(jamais);
    render(<PasseportAgronomiqueScreen parcelle={PARCELLE} />);
    expect(screen.getByLabelText("Analyse en cours")).toBeInTheDocument();
  });

  it("succès → verdict, score, onglets ; clic onglet → détail + traçabilité", async () => {
    getPasseportMock.mockResolvedValue(passeport());
    render(<PasseportAgronomiqueScreen parcelle={PARCELLE} />);

    await waitFor(() =>
      expect(screen.getByText("Potentiel élevé — terrain irrigable")).toBeInTheDocument(),
    );
    expect(screen.getByRole("img", { name: "AgriScore 88 sur 100" })).toBeInTheDocument();
    expect(screen.getByText("Fiabilité 80 %")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Sol/ }));
    expect(screen.getByText("Type de sol")).toBeInTheDocument();
    expect(screen.getByText("argilo-limoneux")).toBeInTheDocument();
    expect(screen.getByText(/Source :/)).toBeInTheDocument();
  });

  it("422 → message « pas encore géolocalisée », pas de bouton réessayer", async () => {
    getPasseportMock.mockRejectedValue(
      Object.assign(new Error(), { name: "PasseportIndisponibleError", raison: "non_geolocalisee" }),
    );
    render(<PasseportAgronomiqueScreen parcelle={PARCELLE} />);

    await waitFor(() => expect(screen.getByText(/pas encore géolocalisée/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
  });

  it("erreur → « momentanément indisponible » + Réessayer relance le fetch", async () => {
    getPasseportMock.mockRejectedValueOnce(
      Object.assign(new Error(), { name: "PasseportIndisponibleError", raison: "erreur" }),
    );
    getPasseportMock.mockResolvedValueOnce(passeport());
    render(<PasseportAgronomiqueScreen parcelle={PARCELLE} />);

    await waitFor(() => expect(screen.getByText(/momentanément indisponible/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));

    await waitFor(() =>
      expect(screen.getByText("Potentiel élevé — terrain irrigable")).toBeInTheDocument(),
    );
    expect(getPasseportMock).toHaveBeenCalledTimes(2);
  });

  it("mode simulé → badge « Données simulées »", async () => {
    getPasseportMock.mockResolvedValue(passeport({ mode: "simule", avertissement: "Passeport généré en mode simulé." }));
    render(<PasseportAgronomiqueScreen parcelle={PARCELLE} />);
    await waitFor(() => expect(screen.getByText("Données simulées")).toBeInTheDocument());
  });

  it("passeport partiel → bandeau + onglet de la dimension indisponible", async () => {
    getPasseportMock.mockResolvedValue(
      passeport({
        dimensionsIndisponibles: ["topo"],
        avertissement: "Passeport partiel : relief indisponible(s).",
        dimensions: {
          ...passeport().dimensions,
          topo: dim({ statut: "indisponible", sousScore: null, confiance: 0, valeurs: {} }),
        },
      }),
    );
    render(<PasseportAgronomiqueScreen parcelle={PARCELLE} />);

    await waitFor(() => expect(screen.getByText(/Passeport partiel/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /Topographie/ }));
    expect(screen.getByText(/n'entre pas dans le calcul du score/)).toBeInTheDocument();
  });
});
