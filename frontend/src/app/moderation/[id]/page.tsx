import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { getRevueAnnonce } from "@/lib/moderation-api";
import { mapAnnonceDetailToParcelle } from "@/lib/mapAnnonceToParcelle";
import { RevueAnnonceScreen } from "@/components/moderation/RevueAnnonceScreen";

export const metadata: Metadata = { title: "Revue d'annonce • Modération AKAL" };

export default async function RevueAnnoncePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect(`/connexion?next=/moderation/${id}`);
  if (!utilisateur.peut_moderer) redirect("/");

  const revue = await getRevueAnnonce(id).catch(() => null);
  if (!revue) notFound();

  return (
    <RevueAnnonceScreen
      revue={revue}
      parcelle={mapAnnonceDetailToParcelle(revue)}
      peutSuspendreComptes={!!utilisateur.peut_suspendre_comptes}
    />
  );
}
