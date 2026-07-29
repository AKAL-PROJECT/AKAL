import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { getParcelleBySlug } from "@/data/parcelles";
import { NouvelleConversationForm } from "@/components/messaging/NouvelleConversationForm";

export const metadata: Metadata = { title: "Nouveau message • AKAL" };

// ?annonce=<slug> (pas l'id) — réutilise getParcelleBySlug, la même fonction
// que la fiche parcelle elle-même utilise déjà, plutôt qu'un aller-retour
// séparé par uuid (l'endpoint public de détail est adressé par slug, pas id).
export default async function NouvelleConversationPage({
  searchParams,
}: {
  searchParams: Promise<{ annonce?: string }>;
}) {
  const { annonce: slug } = await searchParams;
  const utilisateur = await getCurrentUser();
  const next = slug ? `/messages/nouveau?annonce=${slug}` : "/messages/nouveau";
  if (!utilisateur) redirect(`/connexion?next=${encodeURIComponent(next)}`);
  if (!slug) redirect("/parcelles");

  const parcelle = await getParcelleBySlug(slug);
  if (!parcelle) notFound();

  return <NouvelleConversationForm parcelle={parcelle} />;
}
