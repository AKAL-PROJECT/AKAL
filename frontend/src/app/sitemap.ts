import type { MetadataRoute } from "next";
import { getParcelles } from "@/data/parcelles";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://akal.ma").replace(/\/+$/, "");

// Même source de données que generateStaticParams (app/parcelles/[slug]/page.tsx)
// — page_size au max autorisé par le contrat (§4.2), suffisant pour le volume
// actuel. Paginer ici aussi le jour où le catalogue dépasse 50 annonces.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const racines: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/parcelles`, changeFrequency: "daily", priority: 0.9 },
  ];

  const { results } = await getParcelles({ page_size: 50 });
  const annonces: MetadataRoute.Sitemap = results.map((p) => ({
    url: `${SITE_URL}/parcelles/${p.slug}`,
    lastModified: p.datePublication ?? p.createdAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...racines, ...annonces];
}
