// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAgriScoreResume } from "./useAgriScoreResume";
import { getPasseport, PasseportIndisponibleError } from "@/lib/passeport-api";
import type { Passeport } from "@/lib/passeport-api";

vi.mock("@/lib/passeport-api", async (importReal) => {
  const real = await importReal<typeof import("@/lib/passeport-api")>();
  return { ...real, getPasseport: vi.fn() };
});

const getPasseportMock = vi.mocked(getPasseport);

afterEach(() => vi.clearAllMocks());

function passeport(over: Partial<Passeport> = {}): Passeport {
  return {
    parcelleId: "a1c4e7f0-2b5d-4e8a-b3c6-d9f2a5b8c1e4",
    genereLe: "2026-09-11T10:00:00Z",
    mode: "reel",
    scoreGlobal: 78,
    fiabiliteGlobale: 90,
    dimensions: {} as Passeport["dimensions"],
    dimensionsIndisponibles: [],
    culturesSuggerees: [],
    avertissement: "",
    ...over,
  };
}

describe("useAgriScoreResume", () => {
  it("démarre en 'chargement'", () => {
    getPasseportMock.mockReturnValue(new Promise(() => {})); // jamais résolue
    const { result } = renderHook(() => useAgriScoreResume("PARC-1"));
    expect(result.current).toEqual({ statut: "chargement" });
  });

  it("passe à 'ok' avec le passeport une fois le fetch résolu", async () => {
    const p = passeport();
    getPasseportMock.mockResolvedValue(p);

    const { result } = renderHook(() => useAgriScoreResume("PARC-1"));

    await waitFor(() => expect(result.current.statut).toBe("ok"));
    expect(result.current).toEqual({ statut: "ok", passeport: p });
    expect(getPasseportMock).toHaveBeenCalledWith("PARC-1");
  });

  it.each([
    ["non_geolocalisee"],
    ["introuvable"],
    ["en_cours"],
    ["erreur"],
  ] as const)("passe à 'indisponible' avec raison=%s", async (raison) => {
    getPasseportMock.mockRejectedValue(new PasseportIndisponibleError(raison));

    const { result } = renderHook(() => useAgriScoreResume("PARC-1"));

    await waitFor(() => expect(result.current.statut).toBe("indisponible"));
    expect(result.current).toEqual({ statut: "indisponible", raison });
  });

  it("ne met pas à jour l'état après démontage (pas d'appel setState différé)", async () => {
    const avertissements = vi.spyOn(console, "error").mockImplementation(() => {});
    let resoudre!: (p: Passeport) => void;
    getPasseportMock.mockReturnValue(
      new Promise<Passeport>((resolve) => {
        resoudre = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useAgriScoreResume("PARC-1"));
    unmount();
    resoudre(passeport());
    await new Promise((r) => setTimeout(r, 0));

    expect(result.current).toEqual({ statut: "chargement" }); // jamais mis à jour après démontage
    expect(avertissements).not.toHaveBeenCalled();
    avertissements.mockRestore();
  });

  it("relance le fetch si parcelleId change", async () => {
    getPasseportMock.mockResolvedValue(passeport());
    const { rerender } = renderHook(({ id }) => useAgriScoreResume(id), {
      initialProps: { id: "PARC-1" },
    });

    await waitFor(() => expect(getPasseportMock).toHaveBeenCalledWith("PARC-1"));

    rerender({ id: "PARC-2" });
    await waitFor(() => expect(getPasseportMock).toHaveBeenCalledWith("PARC-2"));
    expect(getPasseportMock).toHaveBeenCalledTimes(2);
  });
});
