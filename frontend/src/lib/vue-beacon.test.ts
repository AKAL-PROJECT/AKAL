// @vitest-environment jsdom
//
// signalerVueFiche : beacon de comptage de vue envoyé au montage de la fiche.
// jsdom fournit window + localStorage ; fetch est mocké — ce test porte sur
// la déduplication locale et la robustesse (jamais de throw), pas sur
// l'intégration réseau réelle (backend EnregistrerVueAPIView, couvert côté
// Django).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signalerVueFiche } from "./vue-beacon";

const ID = "3f2b6c9e-8a41-4d2c-9f1e-7b5a2c8d4e10";

describe("signalerVueFiche", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("premier appel => un POST vers /annonces/<id>/vue/", () => {
    signalerVueFiche(ID);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(new RegExp(`/annonces/${ID}/vue/$`));
    expect(init).toMatchObject({ method: "POST" });
  });

  it("appels rapprochés => un seul POST (dédup localStorage)", () => {
    signalerVueFiche(ID);
    signalerVueFiche(ID);
    signalerVueFiche(ID);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("au-delà de la fenêtre de dédup => un nouveau POST", () => {
    vi.useFakeTimers();
    signalerVueFiche(ID);
    vi.advanceTimersByTime(7 * 60 * 60 * 1000); // > 6 h
    signalerVueFiche(ID);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("id vide => aucun appel", () => {
    signalerVueFiche("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("localStorage qui jette => tente quand même le beacon, sans throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("localStorage indisponible");
    });

    expect(() => signalerVueFiche(ID)).not.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fetch qui rejette => avalé, jamais de rejet non géré", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("hors ligne"))));

    expect(() => signalerVueFiche(ID)).not.toThrow();
    await Promise.resolve();
  });
});
