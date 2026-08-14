// @vitest-environment jsdom
//
// Validation de l'étape 1 — la Server Action (enregistrerInfosGeneralesAction)
// est mockée : ce test vérifie que le composant affiche correctement les
// erreurs qu'elle renvoie et n'avance qu'en cas de succès. La transformation
// FormData -> shape d'appel API est déjà couverte séparément dans
// app/actions/depot-annonce.test.ts.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EtapeInfosGenerales } from "./EtapeInfosGenerales";
import { enregistrerInfosGeneralesAction } from "@/app/actions/depot-annonce";
import type { AnnonceEcriture } from "@/types/depot-annonce";

vi.mock("@/app/actions/depot-annonce", () => ({
  enregistrerInfosGeneralesAction: vi.fn(),
}));

const enregistrerInfosGeneralesActionMock = vi.mocked(enregistrerInfosGeneralesAction);

afterEach(() => {
  vi.clearAllMocks();
});

const ANNONCE_RETOURNEE = { id: "annonce-1" } as AnnonceEcriture;

// Tous les champs sont `required` en HTML — jsdom applique la validation
// native comme un vrai navigateur : un clic sur "Continuer" sans valeurs
// valides ne déclenche jamais formAction (donc jamais l'action mockée),
// constaté en pratique (0 appel, sans le moindre message d'erreur). Chaque
// test de soumission doit donc remplir un formulaire valide au préalable —
// ce n'est PAS ce qui est testé ici (la validation native HTML n'a rien de
// spécifique à ce composant), seulement un passage obligé pour atteindre
// l'action serveur mockée.
function remplirFormulaireValide() {
  fireEvent.change(screen.getByLabelText("Titre de l'annonce"), { target: { value: "Belle parcelle" } });
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Une description suffisamment longue." },
  });
  fireEvent.change(screen.getByLabelText("Prix (MAD)"), { target: { value: "150000" } });
  fireEvent.change(screen.getByLabelText("Surface (hectares)"), { target: { value: "2.5" } });
  fireEvent.change(screen.getByLabelText("Statut foncier"), { target: { value: "melkia" } });
  fireEvent.change(screen.getByLabelText("Accès à l'eau"), { target: { value: "irriguee" } });
  fireEvent.change(screen.getByLabelText("Topographie"), { target: { value: "plat" } });
  fireEvent.change(screen.getByLabelText("Accès routier"), { target: { value: "goudron" } });
}

describe("EtapeInfosGenerales — soumission", () => {
  it("succès => appelle onSuivant avec l'annonce renvoyée par le serveur", async () => {
    enregistrerInfosGeneralesActionMock.mockResolvedValue({
      annonce: ANNONCE_RETOURNEE,
      error: "",
      fieldErrors: null,
    });
    const onSuivant = vi.fn();

    render(<EtapeInfosGenerales annonce={null} onSuivant={onSuivant} />);
    remplirFormulaireValide();
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));

    await waitFor(() => expect(onSuivant).toHaveBeenCalledWith(ANNONCE_RETOURNEE));
  });

  // Statut foncier / passeport agronomique facultatifs (audit dépôt
  // d'annonce, correctif optionalité) : ni titre/description/prix/surface
  // (ceux-là restent required) ne sont touchés, seuls ces 4 selects.
  it("succès sans statut foncier ni données agronomiques => appelle onSuivant quand même", async () => {
    enregistrerInfosGeneralesActionMock.mockResolvedValue({
      annonce: ANNONCE_RETOURNEE,
      error: "",
      fieldErrors: null,
    });
    const onSuivant = vi.fn();

    render(<EtapeInfosGenerales annonce={null} onSuivant={onSuivant} />);
    fireEvent.change(screen.getByLabelText("Titre de l'annonce"), { target: { value: "Belle parcelle" } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Une description suffisamment longue." },
    });
    fireEvent.change(screen.getByLabelText("Prix (MAD)"), { target: { value: "150000" } });
    fireEvent.change(screen.getByLabelText("Surface (hectares)"), { target: { value: "2.5" } });
    // Statut foncier / accès eau / topographie / accès routier : laissés
    // sur "Non renseigné" (valeur "") — c'est précisément ce qui est testé.
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));

    await waitFor(() => expect(onSuivant).toHaveBeenCalledWith(ANNONCE_RETOURNEE));
  });

  it("erreur de validation serveur => affiche le message à côté du bon champ, n'avance pas", async () => {
    enregistrerInfosGeneralesActionMock.mockResolvedValue({
      annonce: null,
      error: "Ce champ est obligatoire.",
      fieldErrors: { titre: ["Ce champ est obligatoire."] },
    });
    const onSuivant = vi.fn();

    render(<EtapeInfosGenerales annonce={null} onSuivant={onSuivant} />);
    remplirFormulaireValide();
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));

    // Deux occurrences attendues : le message de champ (à côté de "titre")
    // ET le message d'erreur général en bas — même texte, cf. etatErreur()
    // dans app/actions/depot-annonce.ts (error = premier message de fieldErrors).
    await waitFor(() => expect(screen.getAllByText("Ce champ est obligatoire.")).toHaveLength(2));
    expect(onSuivant).not.toHaveBeenCalled();
  });

  it("erreur générique (pas de fieldErrors) => affiche le message global", async () => {
    enregistrerInfosGeneralesActionMock.mockResolvedValue({
      annonce: null,
      error: "Une erreur est survenue. Réessayez.",
      fieldErrors: null,
    });

    render(<EtapeInfosGenerales annonce={null} onSuivant={vi.fn()} />);
    remplirFormulaireValide();
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));

    await waitFor(() => expect(screen.getByText("Une erreur est survenue. Réessayez.")).toBeInTheDocument());
  });
});

describe("EtapeInfosGenerales — reprise d'un brouillon existant", () => {
  it("pré-remplit les champs depuis l'annonce existante, libellé du bouton en mode édition", () => {
    const annonceExistante: AnnonceEcriture = {
      id: "annonce-1",
      slug: "s",
      titre: "Titre existant",
      description: "Description existante",
      prix_mad: 250000,
      statut: "brouillon",
      loc_confidentielle: true,
      parcelle: {
        surface_ha: 4,
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

    render(<EtapeInfosGenerales annonce={annonceExistante} onSuivant={vi.fn()} modeEdition />);

    expect(screen.getByLabelText("Titre de l'annonce")).toHaveValue("Titre existant");
    expect(screen.getByLabelText("Prix (MAD)")).toHaveValue(250000);
    expect(screen.getByLabelText("Surface (hectares)")).toHaveValue(4);
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeInTheDocument();
  });
});
