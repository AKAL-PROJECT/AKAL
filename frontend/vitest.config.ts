import { defineConfig } from "vitest/config";

// environment "node" par défaut (tests unitaires purs : mappers, filtres,
// proxy.ts, Server Actions — pas de DOM requis). Les tests de composants/hooks
// React basculent en jsdom via le commentaire magique "// @vitest-environment
// jsdom" en tête de fichier (cf. useFavorisIds.test.ts, EtapeLocalisation.test.tsx) —
// pas de jsdom global ici, pour ne pas ralentir/complexifier les tests purs.
// resolve.tsconfigPaths résout les alias "@/*" du tsconfig.json.
//
// include couvre .ts ET .tsx (audit du 2026-08-11) — ne matchait que .ts
// jusqu'ici : les premiers tests de composants (JSX, donc .tsx) écrits pour
// le dépôt d'annonce n'étaient de fait jamais exécutés par `npm test`,
// aucune erreur ni avertissement ne le signalait.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
