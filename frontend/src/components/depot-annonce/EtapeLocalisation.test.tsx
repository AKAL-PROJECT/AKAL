// @vitest-environment jsdom
//
// Cascade région → province → commune, et validation du bouton Continuer
// (pretAContinuer). geo-api et l'action serveur sont mockées ; CarteLeafletPicker
// (Leaflet, chargé via next/dynamic) est remplacée par une doublure minimale
// exposant deux boutons de test (placer un repère, ajouter un sommet) — ce
// test ne porte jamais sur le rendu cartographique réel.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EtapeLocalisation } from "./EtapeLocalisation";
import { fetchCommuneGeomDetail, fetchCommunesGeom, fetchProvincesGeom, fetchRegionsOfficielles } from "@/lib/geo-api";
import type { AnnonceEcriture, CommuneGeomRef, ProvinceGeomRef, RegionOfficielleRef } from "@/types/depot-annonce";

vi.mock("@/lib/geo-api", () => ({
  fetchRegionsOfficielles: vi.fn(),
  fetchProvincesGeom: vi.fn(),
  fetchCommunesGeom: vi.fn(),
  fetchCommuneGeomDetail: vi.fn(),
}));

vi.mock("@/app/actions/depot-annonce", () => ({
  enregistrerLocalisationAction: vi.fn(),
}));

vi.mock("./CarteLeafletPicker", () => ({
  default: ({
    onChangePosition,
    onAjouterSommet,
  }: {
    onChangePosition: (pos: [number, number]) => void;
    onAjouterSommet: (sommet: [number, number]) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onChangePosition([33.5, -5.5])}>
        [stub carte] Placer un repère
      </button>
      <button type="button" onClick={() => onAjouterSommet([33.5, -5.5])}>
        [stub carte] Ajouter un sommet
      </button>
    </div>
  ),
}));

const fetchRegionsOfficiellesMock = vi.mocked(fetchRegionsOfficielles);
const fetchProvincesGeomMock = vi.mocked(fetchProvincesGeom);
const fetchCommunesGeomMock = vi.mocked(fetchCommunesGeom);
const fetchCommuneGeomDetailMock = vi.mocked(fetchCommuneGeomDetail);

const REGIONS: RegionOfficielleRef[] = [{ code: 3, slug: "fes-meknes", nom: "Fès-Meknès" }];
const PROVINCES: ProvinceGeomRef[] = [{ id: 1, iso: "MA-03-131", nom: "Meknès", region: REGIONS[0] }];
const COMMUNES: CommuneGeomRef[] = [
  { id: 1, nomAffichage: "Meknès Ville", typeCommune: "MU", province: { id: 1, nom: "Meknès" }, region: REGIONS[0] },
];

function annonceSansLocalisation(): AnnonceEcriture {
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
  };
}

// Sélectionne la cascade complète (région -> province -> commune), le
// passage obligé de presque tous les tests ci-dessous.
async function selectionnerLaCascade() {
  await waitFor(() => expect(screen.getByRole("option", { name: "Fès-Meknès" })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("Région"), { target: { value: "fes-meknes" } });
  await waitFor(() => expect(screen.getByRole("option", { name: "Meknès" })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("Province"), { target: { value: "1" } });
  await waitFor(() => expect(screen.getByRole("option", { name: "Meknès Ville" })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("Commune"), { target: { value: "1" } });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("EtapeLocalisation — cascade région → province → commune", () => {
  it("charge les régions au montage, puis chaque niveau à la sélection du précédent", async () => {
    fetchRegionsOfficiellesMock.mockResolvedValue(REGIONS);
    fetchProvincesGeomMock.mockResolvedValue(PROVINCES);
    fetchCommunesGeomMock.mockResolvedValue(COMMUNES);

    render(<EtapeLocalisation annonce={annonceSansLocalisation()} onPrecedent={vi.fn()} onSuivant={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("option", { name: "Fès-Meknès" })).toBeInTheDocument());
    expect(fetchProvincesGeomMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Région"), { target: { value: "fes-meknes" } });

    await waitFor(() => expect(fetchProvincesGeomMock).toHaveBeenCalledWith("fes-meknes"));
    await waitFor(() => expect(screen.getByRole("option", { name: "Meknès" })).toBeInTheDocument());
    expect(fetchCommunesGeomMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Province"), { target: { value: "1" } });

    await waitFor(() => expect(fetchCommunesGeomMock).toHaveBeenCalledWith({ province: 1 }));
    await waitFor(() => expect(screen.getByRole("option", { name: "Meknès Ville" })).toBeInTheDocument());
  });

  it("changer de région réinitialise la province et la commune déjà choisies", async () => {
    fetchRegionsOfficiellesMock.mockResolvedValue(REGIONS);
    fetchProvincesGeomMock.mockResolvedValue(PROVINCES);
    fetchCommunesGeomMock.mockResolvedValue(COMMUNES);

    render(<EtapeLocalisation annonce={annonceSansLocalisation()} onPrecedent={vi.fn()} onSuivant={vi.fn()} />);
    await selectionnerLaCascade();
    await waitFor(() => expect(screen.getByLabelText("Commune")).toHaveValue("1"));

    fireEvent.change(screen.getByLabelText("Région"), { target: { value: "" } });

    expect(screen.getByLabelText("Province")).toHaveValue("");
    expect(screen.getByLabelText("Province")).toBeDisabled();
    expect(screen.getByLabelText("Commune")).toHaveValue("");
    expect(screen.getByLabelText("Commune")).toBeDisabled();
  });

  it("pré-remplit la cascade quand l'annonce a déjà une commune enregistrée", async () => {
    fetchRegionsOfficiellesMock.mockResolvedValue(REGIONS);
    fetchProvincesGeomMock.mockResolvedValue(PROVINCES);
    fetchCommunesGeomMock.mockResolvedValue(COMMUNES);
    fetchCommuneGeomDetailMock.mockResolvedValue(COMMUNES[0]);

    const base = annonceSansLocalisation();
    const annonceGeolocalisee: AnnonceEcriture = {
      ...base,
      parcelle: { ...base.parcelle, commune_geom: 1, latitude: 33.5, longitude: -5.5 },
    };

    render(<EtapeLocalisation annonce={annonceGeolocalisee} onPrecedent={vi.fn()} onSuivant={vi.fn()} />);

    expect(fetchCommuneGeomDetailMock).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.getByLabelText("Commune")).toHaveValue("1"));
    expect(screen.getByLabelText("Région")).toHaveValue("fes-meknes");
    expect(screen.getByLabelText("Province")).toHaveValue("1");
  });
});

describe("EtapeLocalisation — validation (bouton Continuer)", () => {
  it("désactivé tant qu'aucune commune ni repère n'est choisi", async () => {
    fetchRegionsOfficiellesMock.mockResolvedValue(REGIONS);

    render(<EtapeLocalisation annonce={annonceSansLocalisation()} onPrecedent={vi.fn()} onSuivant={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Continuer" })).toBeDisabled();
  });

  it("reste désactivé avec une commune choisie mais sans repère", async () => {
    fetchRegionsOfficiellesMock.mockResolvedValue(REGIONS);
    fetchProvincesGeomMock.mockResolvedValue(PROVINCES);
    fetchCommunesGeomMock.mockResolvedValue(COMMUNES);

    render(<EtapeLocalisation annonce={annonceSansLocalisation()} onPrecedent={vi.fn()} onSuivant={vi.fn()} />);
    await selectionnerLaCascade();

    expect(screen.getByRole("button", { name: "Continuer" })).toBeDisabled();
  });

  it("activé une fois commune choisie ET repère placé", async () => {
    fetchRegionsOfficiellesMock.mockResolvedValue(REGIONS);
    fetchProvincesGeomMock.mockResolvedValue(PROVINCES);
    fetchCommunesGeomMock.mockResolvedValue(COMMUNES);

    render(<EtapeLocalisation annonce={annonceSansLocalisation()} onPrecedent={vi.fn()} onSuivant={vi.fn()} />);
    await selectionnerLaCascade();

    fireEvent.click(screen.getByText("[stub carte] Placer un repère"));

    expect(screen.getByRole("button", { name: "Continuer" })).not.toBeDisabled();
  });

  it("un polygone à 1 ou 2 sommets bloque la validation (état ambigu), même avec commune choisie", async () => {
    fetchRegionsOfficiellesMock.mockResolvedValue(REGIONS);
    fetchProvincesGeomMock.mockResolvedValue(PROVINCES);
    fetchCommunesGeomMock.mockResolvedValue(COMMUNES);

    render(<EtapeLocalisation annonce={annonceSansLocalisation()} onPrecedent={vi.fn()} onSuivant={vi.fn()} />);
    await selectionnerLaCascade();

    fireEvent.click(screen.getByText("Dessiner un polygone"));
    fireEvent.click(screen.getByText("[stub carte] Ajouter un sommet"));

    expect(screen.getByText(/Encore 2 sommets pour former un polygone valide/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuer" })).toBeDisabled();

    fireEvent.click(screen.getByText("[stub carte] Ajouter un sommet"));

    expect(screen.getByText(/Encore 1 sommet pour former un polygone valide/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuer" })).toBeDisabled();

    fireEvent.click(screen.getByText("[stub carte] Ajouter un sommet"));

    // 3 sommets : polygone valide, l'état ambigu disparaît.
    expect(screen.queryByText(/pour former un polygone valide/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuer" })).not.toBeDisabled();
  });
});

describe("EtapeLocalisation — bouton Précédent", () => {
  it("appelle onPrecedent au clic, sans passer par l'action serveur", async () => {
    fetchRegionsOfficiellesMock.mockResolvedValue(REGIONS);
    const onPrecedent = vi.fn();

    render(<EtapeLocalisation annonce={annonceSansLocalisation()} onPrecedent={onPrecedent} onSuivant={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Précédent" }));

    expect(onPrecedent).toHaveBeenCalledTimes(1);
  });
});
