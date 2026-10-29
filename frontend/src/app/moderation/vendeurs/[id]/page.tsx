import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { getDossierVendeur } from "@/lib/moderation-api";
import { DossierVendeurScreen } from "@/components/moderation/DossierVendeurScreen";

export const metadata: Metadata = { title: "Dossier vendeur • Modération AKAL" };

export default async function DossierVendeurPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect(`/connexion?next=/moderation/vendeurs/${id}`);
  if (!utilisateur.peut_moderer) redirect("/");

  const dossier = await getDossierVendeur(id).catch(() => null);
  if (!dossier) notFound();

  return (
    <DossierVendeurScreen
      dossier={dossier}
      peutSuspendre={!!utilisateur.peut_suspendre_comptes && utilisateur.id !== dossier.vendeur.id}
    />
  );
}
