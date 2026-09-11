import { afterEach, describe, expect, it, vi } from "vitest";
import { planifier } from "./agriscore-concurrency";

// planifier() maintient un état module-scope (enVol/attente) — chaque test
// doit repartir d'une file vide, sinon une tâche laissée en attente par un
// test précédent fausserait le suivant. On draine explicitement plutôt que
// de réinitialiser le module (pas d'API d'export pour ça, volontairement :
// un simple compteur/queue interne, pas une classe instanciable).
async function vider() {
  // MAX_CONCURRENT = 5 (cf. agriscore-concurrency.ts) : au plus 5 tâches
  // en vol à la fois, jamais plus de 5 tours nécessaires pour tout vider.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe("planifier", () => {
  afterEach(async () => {
    await vider();
  });

  it("lance immédiatement une tâche isolée", async () => {
    const tache = vi.fn().mockResolvedValue("ok");
    const resultat = await planifier(tache);
    expect(resultat).toBe("ok");
    expect(tache).toHaveBeenCalledTimes(1);
  });

  it("ne dépasse jamais MAX_CONCURRENT (5) tâches en vol simultanément", async () => {
    let enVol = 0;
    let maxObserve = 0;
    const resolveurs: (() => void)[] = [];

    const tache = () =>
      new Promise<void>((resolve) => {
        enVol++;
        maxObserve = Math.max(maxObserve, enVol);
        resolveurs.push(() => {
          enVol--;
          resolve();
        });
      });

    // 12 tâches lancées d'un coup — bien plus que MAX_CONCURRENT.
    const promesses = Array.from({ length: 12 }, () => planifier(tache));

    await vider();
    expect(maxObserve).toBe(5); // jamais plus de 5 en vol

    // Résout tout, une vague à la fois, jusqu'à épuisement de la file.
    while (resolveurs.length > 0) {
      resolveurs.splice(0).forEach((r) => r());
      await vider();
    }

    await Promise.all(promesses);
    expect(maxObserve).toBe(5); // toujours vrai après écoulement complet
  });

  it("dépile la file même quand une tâche échoue (finally, pas then)", async () => {
    let enVol = 0;
    let maxObserve = 0;
    const resolveurs: (() => void)[] = [];

    // Les 5 premières échouent toutes — si planifier() ne dépilait que sur
    // succès (`.then` au lieu de `.finally`), la 6e ne démarrerait jamais.
    const tacheEchec = () =>
      new Promise<void>((_resolve, reject) => {
        enVol++;
        maxObserve = Math.max(maxObserve, enVol);
        resolveurs.push(() => {
          enVol--;
          reject(new Error("échec attendu"));
        });
      });

    const promesses = Array.from({ length: 6 }, () =>
      planifier(tacheEchec).catch((e: Error) => e.message),
    );

    await vider();
    expect(maxObserve).toBe(5);

    while (resolveurs.length > 0) {
      resolveurs.splice(0).forEach((r) => r());
      await vider();
    }

    const resultats = await Promise.all(promesses);
    expect(resultats).toEqual(Array(6).fill("échec attendu"));
  });

  it("résout chaque appelant avec le résultat de SA propre tâche", async () => {
    const [a, b, c] = await Promise.all([
      planifier(() => Promise.resolve("a")),
      planifier(() => Promise.resolve("b")),
      planifier(() => Promise.resolve("c")),
    ]);
    expect([a, b, c]).toEqual(["a", "b", "c"]);
  });
});
