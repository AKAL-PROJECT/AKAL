import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { getJournalModeration, getQueueModeration } from "@/lib/moderation-api";
import { ModerationScreen } from "@/components/moderation/ModerationScreen";

export const metadata: Metadata = {
  title: "Modération • AKAL",
  description: "Annonces à revoir (signal automatique et signalements) et journal des décisions.",
};

export default async function ModerationPage() {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/moderation");
  if (!utilisateur.peut_moderer) redirect("/");

  const [annonces, journal] = await Promise.all([getQueueModeration(), getJournalModeration()]);
  return <ModerationScreen annonces={annonces} journal={journal} />;
}
