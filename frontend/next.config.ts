import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Dev uniquement : MinIO (stockage médias, cf. F03) tourne en local sur un
// host loopback (localhost:9000). Next.js bloque par défaut toute image dont
// le host résout vers une IP privée/loopback (protection SSRF), même si le
// host est listé dans `remotePatterns` — les deux mécanismes sont
// indépendants. `dangerouslyAllowLocalIP` lève ce blocage ; on ne l'active
// donc jamais en production, où seul le CDN public (media.akal.ma) sert
// les images.
const isDev = process.env.NODE_ENV !== "production";

// Garde de build (audit du 2026-07-30) : les mocks du catalogue ne doivent
// jamais atteindre la production — si NEXT_PUBLIC_USE_MOCKS="true" survit
// jusqu'à un build de prod, c'est une erreur de configuration, pas un choix
// délibéré. On fait échouer le build plutôt que de livrer un catalogue
// factice silencieusement.
if (!isDev && process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
  throw new Error(
    'NEXT_PUBLIC_USE_MOCKS="true" détecté en build de production — le catalogue servirait des données factices. Retirez cette variable (ou passez-la à "false") avant de builder pour la production.',
  );
}

const nextConfig: NextConfig = {
  // Morph photo catalogue → fiche parcelle (React <ViewTransition>, App
  // Router) — dégrade proprement sans animation sur les navigateurs sans
  // support de la View Transitions API, aucune dépendance ajoutée. Depuis
  // Next 16.3, les View Transitions de l'App Router ne nécessitent plus de
  // flag `experimental.viewTransition` (stabilisées) — cf.
  // node_modules/next/dist/docs/01-app/02-guides/view-transitions.md.
  images: {
    remotePatterns: [
      // Mock data du catalogue (photos Unsplash) — à retirer avec les mocks.
      { protocol: "https", hostname: "images.unsplash.com" },
      // Bucket MinIO public en lecture (contrat v1.1 §4.7) — URLs absolues,
      // jamais de préfixe concaténé côté front. Domaine d'après l'exemple du
      // contrat (media.akal.ma) ; à ajuster si Ibrahim confirme un autre host/CDN.
      { protocol: "https", hostname: "media.akal.ma" },
      // MinIO en dev local — AWS_S3_CUSTOM_DOMAIN est vide en dev (cf.
      // backend/.env.example), les URLs de photo pointent donc directement
      // vers l'endpoint MinIO, jamais vers Django (qui ne sert plus les
      // médias depuis le passage à django-storages).
      ...(isDev
        ? [{ protocol: "http" as const, hostname: "localhost", port: "9000", pathname: "/**" }]
        : []),
    ],
    ...(isDev ? { dangerouslyAllowLocalIP: true } : {}),
  },
};

// Sentry (audit du 2026-08-03) — l'upload des source maps a besoin de
// SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN (cf. .env.example) ; sans eux
// le plugin webpack de Sentry saute cette étape avec un avertissement, pas
// une erreur de build (silent masque cet avertissement hors CI). Le
// monitoring runtime lui-même (Sentry.init dans instrumentation*.ts) ne
// dépend en rien de ces trois variables — seul NEXT_PUBLIC_SENTRY_DSN compte.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
