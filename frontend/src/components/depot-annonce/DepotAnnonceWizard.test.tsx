// @vitest-environment jsdom
//
// Navigation des 3 étapes — les composants d'étape sont mockés en doublures
// minimales (un bouton qui invoque directement le callback reçu) : ce test
// ne porte que sur la logique d'orchestration du wizard lui-même (étape de
// départ selon l'état de l'annonce, avancer/reculer, mise à jour de l'URL,
// navigation libre en mode édition) — jamais sur le contenu réel de chaque
// étape, déjà couvert par ailleurs (EtapeLocalisation.test.tsx,
// EtapeInfosGenerales.test.tsx).

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DepotAnnonceWizard } from "./DepotAnnonceWizard";
import type { AnnonceEcriture } from "@/types/depot-annonce";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("./EtapeInfosGenerales", () => ({
  EtapeInfosGenerales: ({ onSuivant }: { onSuivant: (a: AnnonceEcriture) => void }) => (
    <button onClick={() => onSuivant(annonce())}>[stub] Continuer étape 1</button>
  ),
}));
vi.mock("./EtapeLocalisation", () => ({
  EtapeLocalisation: ({
    onPrecedent,
    onSuivant,
  }: {
    onPrecedent: () => void;
    onSuivant: (a: AnnonceEcriture) => void;
  }) => (
    <div>
      <button onClick={onPrecedent}>[stub] Précédent étape 2</button>
      <button onClick={() => onSuivant(annonceGeolocalisee())}>[stub] Continuer étape 2</button>
    </div>
  ),
}));
vi.mock("./EtapePhotosPublication", () => ({
  EtapePhotosPublication: ({ onPrecedent }: { onPrecedent: () => void }) => (
    <button onClick={onPrecedent}>[stub] Précédent étape 3</button>
  ),
}));

function annonce(overrides: Partial<AnnonceEcriture> = {}): AnnonceEcriture {
  return {
    id: "annonce-1",
    slug: "s",
    titre: "T",
    description: "D",
    prix_mad: 100000,
    statut: "brouillon",
    loc_confidentielle: false,
    parcelle: {
      surface_ha: 1,
      statut_foncier: "melkia",
      acces_eau: "irriguee",
      topographie: "plat",
      acces_routier: "goudron",
      commune: null,
      commune_geom: null,
      latitude: null,
      longitude: null,
      contour: null,
    },
    photos: [],
    ...overrides,
  };
}

function annonceGeolocalisee(overrides: Partial<AnnonceEcriture> = {}): AnnonceEcriture {
  const base = annonce(overrides);
  return { ...base, parcelle: { ...base.parcelle, commune_geom: 1, latitude: 33.5, longitude: -5.5 } };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("DepotAnnonceWizard — étape de départ", () => {
  it("nouvelle annonce (aucune) => démarre à l'étape 1 (infos générales)", () => {
    render(<DepotAnnonceWizard annonceInitiale={null} />);

    expect(screen.getByText("[stub] Continuer étape 1")).toBeInTheDocument();
  });

  it("brouillon existant mais non géolocalisé => démarre à l'étape 2 (localisation)", () => {
    render(<DepotAnnonceWizard annonceInitiale={annonce()} />);

    expect(screen.getByText("[stub] Continuer étape 2")).toBeInTheDocument();
  });

  it("brouillon déjà géolocalisé => démarre à l'étape 3 (photos)", () => {
    render(<DepotAnnonceWizard annonceInitiale={annonceGeolocalisee()} />);

    expect(screen.getByText("[stub] Précédent étape 3")).toBeInTheDocument();
  });
});

describe("DepotAnnonceWizard — navigation avant/arrière", () => {
  it("avancer de l'étape 1 à l'étape 2 met à jour l'URL avec l'id de l'annonce", () => {
    render(<DepotAnnonceWizard annonceInitiale={null} />);

    fireEvent.click(screen.getByText("[stub] Continuer étape 1"));

    expect(screen.getByText("[stub] Continuer étape 2")).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith("/publier?id=annonce-1");
  });

  it("avancer de l'étape 2 à l'étape 3", () => {
    render(<DepotAnnonceWizard annonceInitiale={annonce()} />);

    fireEvent.click(screen.getByText("[stub] Continuer étape 2"));

    expect(screen.getByText("[stub] Précédent étape 3")).toBeInTheDocument();
  });

  it("revenir de l'étape 3 à l'étape 2, puis de l'étape 2 à l'étape 1", () => {
    render(<DepotAnnonceWizard annonceInitiale={annonceGeolocalisee()} />);

    fireEvent.click(screen.getByText("[stub] Précédent étape 3"));
    expect(screen.getByText("[stub] Continuer étape 2")).toBeInTheDocument();

    fireEvent.click(screen.getByText("[stub] Précédent étape 2"));
    expect(screen.getByText("[stub] Continuer étape 1")).toBeInTheDocument();
  });
});

describe("DepotAnnonceWizard — mode édition", () => {
  it("annonce déjà publiée (statut != brouillon) => titre d'édition, navigation libre entre étapes", () => {
    render(<DepotAnnonceWizard annonceInitiale={annonceGeolocalisee({ statut: "en_ligne" })} />);

    expect(screen.getByRole("heading", { name: "Modifier votre annonce" })).toBeInTheDocument();

    // Navigation libre via le Stepper — sûre en édition car chaque étape a
    // déjà été enregistrée (cf. commentaire de DepotAnnonceWizard.tsx).
    fireEvent.click(screen.getByLabelText("Aller à l'étape Infos générales"));
    expect(screen.getByText("[stub] Continuer étape 1")).toBeInTheDocument();
  });

  it("nouveau dépôt (brouillon) => titre de dépôt, pas de navigation libre via le Stepper", () => {
    render(<DepotAnnonceWizard annonceInitiale={null} />);

    expect(screen.getByRole("heading", { name: "Déposer une annonce" })).toBeInTheDocument();
    expect(screen.getByLabelText("Aller à l'étape Localisation")).toBeDisabled();
  });
});
