import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { fetchInbox } from "@/lib/messaging-api";
import { InboxScreen } from "@/components/messaging/InboxScreen";

export const metadata: Metadata = {
  title: "Messages • AKAL",
  description: "Vos conversations avec les vendeurs et acheteurs de parcelles.",
};

export default async function MessagesPage() {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/messages");

  const inboxInitiale = await fetchInbox().catch(() => null);

  return <InboxScreen inboxInitiale={inboxInitiale} />;
}
