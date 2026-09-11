// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AgriScoreResume from "./AgriScoreResume";
import { getPasseport, PasseportIndisponibleError } from "@/lib/passeport-api";
import type { Passeport, PasseportDimension } from "@/lib/passeport-api";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/passeport-api", async (importReal) => {
  const real = await importReal<typeof import("@/lib/passeport-api")>();
  return { ...real, getPasseport: vi.fn() };
});

const getPasseportMock = vi.mocked(getPasseport);

afterEach(() => vi.clearAllMocks());

function dim(sousScore: number | null, statut: "ok" | "indisponible" = "ok"): PasseportDimension {
  return {
    statut,
    mode: "reel",
    sousScore,
    confiance: statut === "ok" ? 0.9 : 0,
    valeurs: {},
    source: "test",
    dateCollecte: "2026-09-11T10:00:00Z",
    resolutionM: 30,
    zoneTamponM: 100,
    poidsNominal: 20,
    contribution: 0,
  };
}

// Mêmes valeurs que la maquette produit (Sol 82 · Climat 76 · NDVI 81 ·
// Topographie 69 · Accès 74) — NDVI/Topographie s'affichent sous les
// libellés déjà en place dans l'app (Végétation/Relief, cf.
// lib/passeport-presentation.ts::LIBELLE_DIMENSION), pas ceux de la maquette.
function passeport(over: Partial<Passeport> = {}): Passeport {
  return {
    parcelleId: "a1c4e7f0-2b5d-4e8a-b3c6-d9f2a5b8c1e4",
    genereLe: "2026-09-11T10:00:00Z",
    mode: "reel",
    scoreGlobal: 78,
    fiabiliteGlobale: 88,
    dimensions: {
      sol: dim(82),
      climat: dim(76),
      ndvi: dim(81),
      topo: dim(69),
      acces: dim(74),
    },
    dimensionsIndisponibles: [],
    culturesSuggerees: [],
    avertissement: "",
    ...over,
  };
}

const PROPS = { parcelleId: "PARC-1", slug: "terrain-test", accesEau: null };

describe("AgriScoreResume — états", () => {
  it("chargement → squelette, pas de texte de score", () => {
    getPasseportMock.mockReturnValue(new Promise(() => {}));
    const { container } = render(<AgriScoreResume {...PROPS} />);
    expect(container.querySelector(".skeleton-shimmer")).toBeInTheDocument();
    expect(screen.queryByText(/AgriScore/)).not.toBeInTheDocument();
  });

  it("indisponible (ex. 429/erreur) → message discret, jamais de chiffre inventé", async () => {
    getPasseportMock.mockRejectedValue(new PasseportIndisponibleError("erreur"));
    render(<AgriScoreResume {...PROPS} />);
    expect(await screen.findByText("🌱 Analyse agronomique indisponible")).toBeInTheDocument();
  });

  it("ok avec score → ligne de synthèse arrondie", async () => {
    getPasseportMock.mockResolvedValue(passeport({ scoreGlobal: 68.9 }));
    render(<AgriScoreResume {...PROPS} />);
    expect(await screen.findByText(/AgriScore 69\/100/)).toBeInTheDocument();
  });

  it("ok avec score_global null (aucune dimension exploitable) → 'Potentiel indisponible', pas de crash", async () => {
    getPasseportMock.mockResolvedValue(passeport({ scoreGlobal: null }));
    render(<AgriScoreResume {...PROPS} />);
    expect(await screen.findByText(/Potentiel indisponible/)).toBeInTheDocument();
    expect(screen.queryByText(/AgriScore \d/)).not.toBeInTheDocument();
  });
});

describe("AgriScoreResume — variantes", () => {
  it("compact (défaut) : pas de sous-scores", async () => {
    getPasseportMock.mockResolvedValue(passeport());
    render(<AgriScoreResume {...PROPS} />);
    await screen.findByText(/AgriScore 78\/100/);
    expect(screen.queryByText(/Sol 82/)).not.toBeInTheDocument();
  });

  it("detaille : synthèse + une entrée par dimension ok, dans l'ordre canonique", async () => {
    getPasseportMock.mockResolvedValue(passeport());
    render(<AgriScoreResume {...PROPS} variante="detaille" />);
    await screen.findByText(/AgriScore 78\/100/);
    expect(screen.getByText("Sol 82 · Climat 76 · Végétation 81 · Relief 69 · Accès 74")).toBeInTheDocument();
  });

  it("detaille : une dimension indisponible est omise, jamais un NaN", async () => {
    getPasseportMock.mockResolvedValue(
      passeport({ dimensions: { ...passeport().dimensions, topo: dim(null, "indisponible") } }),
    );
    render(<AgriScoreResume {...PROPS} variante="detaille" />);
    await screen.findByText(/AgriScore 78\/100/);
    expect(screen.getByText("Sol 82 · Climat 76 · Végétation 81 · Accès 74")).toBeInTheDocument();
  });
});

describe("AgriScoreResume — navigation", () => {
  it("clic → navigue vers /parcelles/<slug>/passeport, dans les 3 états", () => {
    getPasseportMock.mockReturnValue(new Promise(() => {})); // reste en "chargement"
    render(<AgriScoreResume {...PROPS} slug="mon-terrain" />);

    fireEvent.click(screen.getByRole("button", { name: "Voir le passeport agronomique complet" }));
    expect(pushMock).toHaveBeenCalledWith("/parcelles/mon-terrain/passeport");
  });

  it("n'imbrique jamais un <a> — un <button>, pour cohabiter avec le <Link> plein-carte de CardParcelle", async () => {
    getPasseportMock.mockResolvedValue(passeport());
    const { container } = render(<AgriScoreResume {...PROPS} />);
    await screen.findByText(/AgriScore/);
    expect(container.querySelector("a")).not.toBeInTheDocument();
    expect(container.querySelector("button")).toBeInTheDocument();
  });

  it("stoppe la propagation — un clic ne déclenche pas le onClick d'un conteneur parent", async () => {
    const onClickParent = vi.fn();
    getPasseportMock.mockResolvedValue(passeport());

    render(
      <div onClick={onClickParent}>
        <AgriScoreResume {...PROPS} />
      </div>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Voir le passeport agronomique complet" }));

    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(onClickParent).not.toHaveBeenCalled();
  });
});

describe("AgriScoreResume — onScore (comparateur)", () => {
  it("appelé avec le score une fois résolu, jamais pendant le chargement", async () => {
    const onScore = vi.fn();
    getPasseportMock.mockResolvedValue(passeport({ scoreGlobal: 78 }));
    render(<AgriScoreResume {...PROPS} onScore={onScore} />);

    expect(onScore).not.toHaveBeenCalled();
    await waitFor(() => expect(onScore).toHaveBeenCalledWith(78));
  });

  it("appelé avec null si le passeport est indisponible", async () => {
    const onScore = vi.fn();
    getPasseportMock.mockRejectedValue(new PasseportIndisponibleError("non_geolocalisee"));
    render(<AgriScoreResume {...PROPS} onScore={onScore} />);

    await waitFor(() => expect(onScore).toHaveBeenCalledWith(null));
  });
});
