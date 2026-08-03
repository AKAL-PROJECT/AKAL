// Sentry — initialisation côté navigateur (audit du 2026-08-03).
//
// No-op tant que NEXT_PUBLIC_SENTRY_DSN n'est pas défini — Sentry.init()
// avec un dsn vide/undefined n'envoie simplement rien, aucune erreur.
// Créer un projet Sentry et renseigner la variable d'env active le
// monitoring sans toucher au code (cf. .env.example).
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  // RGPD (loi 09-08) — jamais d'IP/email/nom envoyés par défaut à un
  // service tiers, même principe que côté backend (base.py, send_default_pii).
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
