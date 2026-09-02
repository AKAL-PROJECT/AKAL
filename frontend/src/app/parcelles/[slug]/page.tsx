import { ViewTransition } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getParcelleBySlug, getParcelles } from "@/data/parcelles";
import { formatMAD } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth-api";
import FicheParcelle from "@/components/parcelles/FicheParcelle";

// Glissement directionnel de la fiche entière : "nav-forward" quand on
// arrive depuis une carte du catalogue (CardParcelle.tsx), "nav-back" au
// retour (liens taggés dans FicheParcelle.tsx). Le catalogue lui-même n'a
// pas de wrapper dédié : il reçoit le fondu par défaut du navigateur, pas de
// glissement — seule la fiche (l'écran signature) porte la direction.
// default="none" empêche toute animation hors navigation typée (ex. refresh).
const TRANSITION_DIRECTIONNELLE = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  default: "none",
} as const;

export async function generateStaticParams() {
  // page_size au max autorisé par le contrat (§4.2) — suffisant pour le
  // volume actuel. Générer les pages suivantes nécessitera de paginer ici
  // via `next` une fois le catalogue au-delà de 50 annonces.
  const { results } = await getParcelles({ page_size: 50 });
  return results.map((p) => ({ slug: p.slug }));
}

// Même convention que app/robots.ts et app/sitemap.ts — une seule source
// pour l'origine publique du site, jamais reconstruite différemment ici.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://akal.ma").replace(/\/+$/, "");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await getParcelleBySlug(slug);
  // getParcelleBySlug ne résout jamais un brouillon (l'API publique
  // GET /api/annonces/<slug>/ est déjà scopée aux annonces en_ligne côté
  // backend, cf. AnnonceDetailAPIView.get_queryset()) — un slug inconnu ou
  // un brouillon produisent donc le même repli générique ici, jamais de
  // metadata construite sur une annonce non publiée.
  if (!p) return { title: "AKAL" };

  const lieu = p.parcelle.adresseApproximative ?? p.parcelle.regionNom;
  const titre = `${p.titre} — AKAL`;
  // Description volontairement identique à celle déjà utilisée pour <title>
  // ci-dessous (surface, lieu, prix) — jamais la description longue de
  // l'annonce (texte libre du vendeur, hors périmètre du extrait de partage)
  // ni aucune donnée liée au propriétaire (téléphone, identité).
  const description = `${p.parcelle.surface} ha · ${lieu} · ${formatMAD.format(p.prix)} MAD`;
  const url = `${SITE_URL}/parcelles/${p.slug}`;
  // photoPrincipale est déjà une URL absolue (PhotoSerializer.get_url,
  // build_absolute_uri côté backend) — jamais reconstruite ici. Peut être
  // `null` (annonce sans photo, cf. contrat §4.4) : dans ce cas, aucun champ
  // `images` n'est renseigné plutôt qu'une URL cassée dans le partage.
  const images = p.photoPrincipale ? [{ url: p.photoPrincipale }] : undefined;

  return {
    title: titre,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: titre,
      description,
      url,
      siteName: "AKAL",
      locale: "fr_MA",
      type: "website",
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: titre,
      description,
      images: images?.map((i) => i.url),
    },
  };
}

export default async function FichePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const parcelle = await getParcelleBySlug(slug);
  if (!parcelle) notFound();
  const utilisateur = await getCurrentUser();
  // Le propriétaire regardant sa propre fiche n'est pas compté comme une vue
  // (le beacon de FicheParcelle est court-circuité, cf. lib/vue-beacon.ts).
  const estProprietaire = !!utilisateur && utilisateur.id === parcelle.proprietaire?.id;
  return (
    <ViewTransition enter={TRANSITION_DIRECTIONNELLE} exit={TRANSITION_DIRECTIONNELLE} default="none">
      <FicheParcelle parcelle={parcelle} estConnecte={!!utilisateur} estProprietaire={estProprietaire} />
    </ViewTransition>
  );
}
