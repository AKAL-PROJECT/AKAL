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

// Profil docker-compose full-stack : les photos sont servies par un MinIO
// local en http://localhost:9000/akal-media (cf. AWS_S3_CUSTOM_DOMAIN du
// service backend). Signalé au build par MEDIA_ALLOW_LOCALHOST=true.
const composeMinio = process.env.MEDIA_ALLOW_LOCALHOST === "true";

// Autorise next/image à charger les médias depuis un MinIO local en
// http://localhost:9000. Vrai en dev (next dev tourne sur l'hôte, qui atteint
// MinIO) ou dans le profil compose. Jamais sur un déploiement réel, où les
// médias sont derrière un domaine public https (cf. mediaHostnames).
const mediaLocalhost = isDev || composeMinio;

// Domaine(s) public(s) du bucket média, à autoriser pour next/image. DOIT
// correspondre à AWS_S3_CUSTOM_DOMAIN du backend (juste le hostname, sans
// protocole ni chemin). Renseigné au déploiement (NEXT_PUBLIC_MEDIA_HOSTNAME,
// cf. render.yaml) : le domaine public d'un bucket R2/B2/CDN n'est connu
// qu'après sa création. Défaut `media.akal.ma` (exemple du contrat §4.7).
// Plusieurs valeurs possibles, séparées par des virgules.
const mediaHostnames = (process.env.NEXT_PUBLIC_MEDIA_HOSTNAME || "media.akal.ma")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

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
  // Sortie autonome (.next/standalone) — image Docker minimale : le
  // serveur Node + uniquement les dépendances réellement utilisées, sans
  // tout node_modules. Sans effet sur `next dev` ni sur Vercel.
  output: "standalone",

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
      // Domaine(s) public(s) du bucket média (S3-compatible : R2 / B2 / CDN).
      // URLs absolues construites par django-storages, jamais de préfixe
      // concaténé côté front. Configurable au déploiement (cf. mediaHostnames).
      ...mediaHostnames.map((hostname) => ({ protocol: "https" as const, hostname })),
      // MinIO local — en dev, AWS_S3_CUSTOM_DOMAIN est vide (cf.
      // backend/.env.example) et les URLs de photo pointent directement vers
      // l'endpoint MinIO ; en docker-compose full-stack, elles pointent vers
      // localhost:9000/akal-media. Dans les deux cas l'hôte à autoriser est
      // localhost:9000. Jamais Django (qui ne sert plus les médias depuis le
      // passage à django-storages).
      ...(mediaLocalhost
        ? [{ protocol: "http" as const, hostname: "localhost", port: "9000", pathname: "/**" }]
        : []),
    ],
    // localhost résout vers une IP loopback : next/image la bloque par défaut
    // (protection SSRF), même hôte autorisé ci-dessus. Levé uniquement quand on
    // sert réellement depuis un MinIO local.
    ...(mediaLocalhost ? { dangerouslyAllowLocalIP: true } : {}),
    // Profil compose : l'optimiseur next/image tourne DANS le conteneur
    // frontend, où `localhost:9000` ne pointe pas vers MinIO (le navigateur,
    // lui, l'atteint via le mapping de port de l'hôte). On sert donc les
    // images non optimisées — le navigateur charge l'URL MinIO directement.
    // Aucun effet en dev (next dev tourne sur l'hôte) ni en prod
    // (media.akal.ma, joignable des deux côtés). Les photos de démo sont des
    // placeholders 800×600, l'optimisation n'apporterait rien ici.
    ...(composeMinio ? { unoptimized: true } : {}),
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
