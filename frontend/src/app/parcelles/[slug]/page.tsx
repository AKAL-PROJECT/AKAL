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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await getParcelleBySlug(slug);
  if (!p) return { title: "AKAL" };
  const lieu = p.parcelle.adresseApproximative ?? p.parcelle.regionNom;
  return {
    title: `${p.titre} — AKAL`,
    description: `${p.parcelle.surface} ha · ${lieu} · ${formatMAD.format(p.prix)} MAD`,
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
  return (
    <ViewTransition enter={TRANSITION_DIRECTIONNELLE} exit={TRANSITION_DIRECTIONNELLE} default="none">
      <FicheParcelle parcelle={parcelle} estConnecte={!!utilisateur} />
    </ViewTransition>
  );
}
