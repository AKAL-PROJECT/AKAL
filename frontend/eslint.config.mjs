import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scripts ponctuels (génération de src/lib/country-codes.ts depuis une
    // API tierce, exécutés une fois avec `node`, jamais importés par
    // l'app) — code Node/CommonJS classique, pas du code applicatif : le
    // `require()` qu'ils utilisent n'est pas une erreur à corriger ici
    // (cf. audit d'intégration du 2026-08-15).
    "fetch_countries.js",
    "generate_countries_node.js",
  ]),
]);

export default eslintConfig;
