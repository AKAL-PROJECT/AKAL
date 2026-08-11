// @vitest-environment jsdom
//
// useFavorisIds gère l'état local des favoris (chargement au montage, toggle
// optimiste avec retour arrière si l'appel serveur échoue) — les deux Server
// Actions dont il dépend (getFavorisIdsAction, toggleFavoriAction) sont
// mockées : ce test porte sur la logique d'état du hook lui-même, jamais sur
// l'intégration réseau réelle (déjà couverte côté fetch dans lib/favoris-api.ts,
// hors périmètre d'un test de hook). Seul fichier du projet nécessitant un DOM
// (renderHook monte un vrai arbre React) — d'où le commentaire magique
// ci-dessus plutôt que de changer l'environnement global (vitest.config.ts
// reste "node" pour les tests purs existants).

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFavorisIds } from "./useFavorisIds";
import { getFavorisIdsAction, toggleFavoriAction } from "@/app/actions/favoris";

vi.mock("next/navigation", () => ({
  usePathname: () => "/parcelles",
  // Reproduit le vrai contrat de unstable_rethrow : ne rethrow QUE les
  // erreurs de contrôle de flux internes à Next.js (redirect/notFound,
  // identifiables par leur `digest`), no-op sur une erreur applicative
  // normale — exactement ce dont useFavorisIds dépend pour ne pas avaler
  // un redirect() derrière son rollback optimiste.
  unstable_rethrow: vi.fn((error: unknown) => {
    const digest = (error as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
  }),
}));

vi.mock("@/app/actions/favoris", () => ({
  getFavorisIdsAction: vi.fn(),
  toggleFavoriAction: vi.fn(),
}));

const getFavorisIdsActionMock = vi.mocked(getFavorisIdsAction);
const toggleFavoriActionMock = vi.mocked(toggleFavoriAction);

afterEach(() => {
  vi.resetAllMocks();
});

describe("useFavorisIds — récupération au montage", () => {
  it("charge les ids favoris au montage", async () => {
    getFavorisIdsActionMock.mockResolvedValue(["annonce-1", "annonce-2"]);

    const { result } = renderHook(() => useFavorisIds());

    expect(result.current.favorisIds).toEqual(new Set()); // vide avant résolution de l'action
    await waitFor(() => expect(result.current.favorisIds).toEqual(new Set(["annonce-1", "annonce-2"])));
  });

  it("reste vide si non authentifié (l'action retourne [])", async () => {
    getFavorisIdsActionMock.mockResolvedValue([]);

    const { result } = renderHook(() => useFavorisIds());

    await waitFor(() => expect(getFavorisIdsActionMock).toHaveBeenCalledTimes(1));
    expect(result.current.favorisIds).toEqual(new Set());
  });
});

describe("useFavorisIds — ajout", () => {
  it("met à jour l'état immédiatement (optimiste), avant même la réponse du serveur, puis confirme", async () => {
    getFavorisIdsActionMock.mockResolvedValue([]);
    let resoudreServeur!: (estFavori: boolean) => void;
    toggleFavoriActionMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resoudreServeur = resolve;
      }),
    );

    const { result } = renderHook(() => useFavorisIds());
    await waitFor(() => expect(result.current.favorisIds).toEqual(new Set()));

    act(() => {
      void result.current.toggleFavori("annonce-1");
    });

    // Optimiste : déjà présent avant même que le serveur ait répondu.
    expect(result.current.favorisIds.has("annonce-1")).toBe(true);
    expect(toggleFavoriActionMock).toHaveBeenCalledWith("annonce-1", "/parcelles");

    await act(async () => {
      resoudreServeur(true);
      await Promise.resolve();
    });

    expect(result.current.favorisIds.has("annonce-1")).toBe(true);
  });
});

describe("useFavorisIds — suppression", () => {
  it("retire l'id après confirmation du serveur", async () => {
    getFavorisIdsActionMock.mockResolvedValue(["annonce-1"]);
    toggleFavoriActionMock.mockResolvedValue(false); // is_favori: false

    const { result } = renderHook(() => useFavorisIds());
    await waitFor(() => expect(result.current.favorisIds.has("annonce-1")).toBe(true));

    await act(async () => {
      await result.current.toggleFavori("annonce-1");
    });

    expect(result.current.favorisIds.has("annonce-1")).toBe(false);
  });
});

describe("useFavorisIds — état local cohérent après mutation", () => {
  it("le résultat serveur fait autorité, même s'il contredit l'optimiste", async () => {
    getFavorisIdsActionMock.mockResolvedValue([]);
    // Optimiste : ajoute (absent -> présent). Serveur répond is_favori=false
    // (contredit l'optimiste, ex. retiré ailleurs entre-temps) — l'état final
    // doit refléter le serveur, jamais rester bloqué sur l'optimiste.
    toggleFavoriActionMock.mockResolvedValue(false);

    const { result } = renderHook(() => useFavorisIds());
    await waitFor(() => expect(result.current.favorisIds).toEqual(new Set()));

    await act(async () => {
      await result.current.toggleFavori("annonce-1");
    });

    expect(result.current.favorisIds.has("annonce-1")).toBe(false);
  });

  it("deux toggles successifs sur des annonces différentes laissent les deux dans un état cohérent", async () => {
    getFavorisIdsActionMock.mockResolvedValue([]);
    toggleFavoriActionMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    const { result } = renderHook(() => useFavorisIds());
    await waitFor(() => expect(result.current.favorisIds).toEqual(new Set()));

    await act(async () => {
      await result.current.toggleFavori("annonce-1");
    });
    await act(async () => {
      await result.current.toggleFavori("annonce-2");
    });

    expect(result.current.favorisIds).toEqual(new Set(["annonce-1", "annonce-2"]));
  });
});

describe("useFavorisIds — erreur API", () => {
  it("annule l'ajout optimiste si le serveur échoue (retour à l'état d'avant)", async () => {
    getFavorisIdsActionMock.mockResolvedValue([]);
    toggleFavoriActionMock.mockRejectedValue(new Error("erreur serveur"));

    const { result } = renderHook(() => useFavorisIds());
    await waitFor(() => expect(result.current.favorisIds).toEqual(new Set()));

    await act(async () => {
      await result.current.toggleFavori("annonce-1");
    });

    // Jamais resté favori après un échec serveur.
    expect(result.current.favorisIds.has("annonce-1")).toBe(false);
  });

  it("annule la suppression optimiste si le serveur échoue (retour à favori)", async () => {
    getFavorisIdsActionMock.mockResolvedValue(["annonce-1"]);
    toggleFavoriActionMock.mockRejectedValue(new Error("erreur serveur"));

    const { result } = renderHook(() => useFavorisIds());
    await waitFor(() => expect(result.current.favorisIds.has("annonce-1")).toBe(true));

    await act(async () => {
      await result.current.toggleFavori("annonce-1");
    });

    expect(result.current.favorisIds.has("annonce-1")).toBe(true);
  });

  it("laisse remonter un redirect Next.js (utilisateur non authentifié) sans l'avaler dans le rollback", async () => {
    // Cf. commentaire de useFavorisIds.ts : sans unstable_rethrow, ce
    // redirect() serait silencieusement absorbé par le catch/rollback.
    getFavorisIdsActionMock.mockResolvedValue([]);
    const erreurRedirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;push;/connexion?next=/parcelles",
    });
    toggleFavoriActionMock.mockRejectedValue(erreurRedirect);

    const { result } = renderHook(() => useFavorisIds());
    await waitFor(() => expect(result.current.favorisIds).toEqual(new Set()));

    await expect(
      act(async () => {
        await result.current.toggleFavori("annonce-1");
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
  });
});
