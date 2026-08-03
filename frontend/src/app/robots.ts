import type { MetadataRoute } from "next";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://akal.ma").replace(/\/+$/, "");

// Tout ce qui exige une session (dashboard, favoris, messagerie, dépôt) ou
// qui n'a aucune valeur comme page d'atterrissage de recherche (auth,
// bienvenue, comparateur — piloté par sessionStorage, rien à indexer) est
// exclu. Chaque entrée bloque son préfixe entier (ex. /messages couvre
// /messages/nouveau et /messages/<id>), pas seulement la route exacte.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/compte",
        "/favoris",
        "/messages",
        "/publier",
        "/comparateur",
        "/bienvenue",
        "/connexion",
        "/inscription",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
