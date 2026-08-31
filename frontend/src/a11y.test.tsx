// @vitest-environment jsdom
//
// Audit automatisé LÉGER d'accessibilité (audit final du 20/08, P12) — jamais
// un audit WCAG complet : axe-core, exécuté contre le rendu jsdom de
// composants déjà réels (pas de doublure UI, contrairement à
// DepotAnnonceWizard.test.tsx qui mocke les étapes), détecte les régressions
// évidentes (label manquant, aria-* invalide, structure de headings, alt
// manquant...) sur un échantillon représentatif des pages listées par
// l'audit : connexion, catalogue, dépôt d'annonce, espace personnel.
//
// Volontairement HORS PÉRIMÈTRE de ce fichier : le contraste de couleur.
// axe-core ne peut évaluer `color-contrast` que contre un rendu peint réel
// (layout + composition CSS) — jsdom ne peint rien, la règle serait
// systématiquement écartée en "incomplete", donnant une fausse impression de
// couverture. Le contraste est vérifié séparément par calcul direct sur la
// palette (cf. rapport d'audit, section Accessibilité) — pas ici.
//
// "Fiche annonce" et "carte" ne sont volontairement pas couverts ici :
// FicheParcelle/CarteLeaflet embarquent Leaflet (canvas/DOM réel requis,
// non disponible en jsdom sans une couche de mocks conséquente) — un test
// qui mockerait la carte ne vérifierait plus rien de représentatif. Même
// principe de proportion que le reste de cet audit : léger, pas exhaustif.

import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { expect, describe, it, vi } from "vitest";

import { EtapeInfosGenerales } from "@/components/depot-annonce/EtapeInfosGenerales";
import ConnexionScreen from "@/components/connexion/ConnexionScreen";
import FiltresSidebar from "@/components/parcelles/FiltresSidebar";
import { EspacePersoNav } from "@/app/(espace-perso)/EspacePersoNav";
import { FILTRES_INITIAUX } from "@/data/parcelles";
import type { User } from "@/lib/auth-api";

expect.extend(toHaveNoViolations);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/favoris",
}));

// enregistrerInfosGeneralesAction (Server Action) ne peut pas s'exécuter en
// jsdom — mockée comme dans EtapeInfosGenerales.test.tsx ; ce fichier ne
// soumet jamais le formulaire, seul le rendu initial est audité.
vi.mock("@/app/actions/depot-annonce", () => ({
  enregistrerInfosGeneralesAction: vi.fn(),
}));

// Idem pour "Sauvegarder cette recherche" (FiltresSidebar) — jamais déclenchée
// ici (aucun clic sur ce bouton), seul le rendu initial est audité.
vi.mock("@/app/actions/recherches-sauvegardees", () => ({
  creerRechercheSauvegardeeAction: vi.fn(),
}));

// fetchCommunesGeom/fetchProvincesGeom (lib/geo-api.ts) ne sont appelées par
// FiltresSidebar qu'après sélection d'une région — jamais au montage initial
// avec FILTRES_INITIAUX (aucune région pré-sélectionnée), mais mockées par
// prudence : aucun `fetch` réel ne doit s'exécuter dans un test.
vi.mock("@/lib/geo-api", () => ({
  fetchCommunesGeom: vi.fn().mockResolvedValue([]),
  fetchProvincesGeom: vi.fn().mockResolvedValue([]),
}));

const UTILISATEUR: User = {
  id: "u-1",
  email: "audit@akal.ma",
  nom: "Alaoui",
  prenom: "Yasmine",
  telephone: null,
  avatar: null,
  role: "VENDEUR",
  is_verified: true,
  date_inscription: "2026-01-01T00:00:00Z",
};

describe("Accessibilité (axe-core, échantillon léger — cf. en-tête du fichier)", () => {
  it("Dépôt d'annonce — étape 1 (Infos générales)", async () => {
    const { container } = render(<EtapeInfosGenerales annonce={null} onSuivant={vi.fn()} />);

    expect(await axe(container)).toHaveNoViolations();
  });

  it("Connexion", async () => {
    // NEXT_PUBLIC_GOOGLE_CLIENT_ID non défini dans l'environnement de test :
    // <GoogleLogin> (nécessite <GoogleOAuthProvider>, non monté ici) ne se
    // rend donc pas — même repli que documenté dans ConnexionScreen.tsx.
    const { container } = render(<ConnexionScreen next="/compte" />);

    expect(await axe(container)).toHaveNoViolations();
  });

  it("Catalogue — panneau de filtres", async () => {
    const { container } = render(
      <FiltresSidebar
        ouverte
        onFermer={vi.fn()}
        filtres={FILTRES_INITIAUX}
        onChange={vi.fn()}
        onReinitialiser={vi.fn()}
        regions={[]}
        onAppliquer={vi.fn()}
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("Espace personnel — navigation à onglets", async () => {
    const { container } = render(<EspacePersoNav utilisateur={UTILISATEUR} />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
