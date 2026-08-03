// Point d'entrée Sentry côté serveur/edge — Next.js appelle register() une
// fois au démarrage de chaque runtime. Le fichier réellement chargé dépend
// du runtime (Node.js pour les Server Components/Actions classiques, edge
// pour src/proxy.ts) : voir sentry.server.config.ts / sentry.edge.config.ts.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
