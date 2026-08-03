// Sentry — initialisation côté serveur (runtime Node.js), chargée par
// instrumentation.ts. Voir instrumentation-client.ts pour le détail du
// comportement no-op sans DSN.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  sendDefaultPii: false,
});
