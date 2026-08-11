// Setup global des tests de composants (audit du 2026-08-11). Deux choses,
// aucune active par défaut sous Vitest (contrairement à Jest) :
//
// 1. Matchers @testing-library/jest-dom (toBeDisabled, toHaveValue,
//    toBeInTheDocument...) — sans cet import, ce sont des propriétés Chai
//    inconnues : échec immédiat en assertion directe, mais AVALÉ EN BOUCLE
//    et confondu avec un vrai timeout quand l'assertion est enveloppée dans
//    waitFor() (qui retente toute erreur jusqu'à sa propre limite de temps).
// 2. cleanup() après chaque test — sans lui, les rendus de tests successifs
//    s'accumulent dans le même document jsdom au sein d'un fichier, et les
//    requêtes screen.getByRole/getByText échouent en "plusieurs éléments
//    trouvés" dès qu'un fichier a plus d'un test qui rend un composant.
//
// Chargé globalement via test.setupFiles (vitest.config.ts) — s'applique à
// tous les tests, y compris ceux en environment "node" (cleanup() y est un
// no-op inoffensif, cf. @testing-library/react).
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
