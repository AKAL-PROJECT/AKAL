import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { fetchConversation, fetchMessages } from "@/lib/messaging-api";
import { ApiError } from "@/lib/api";
import { ThreadScreen } from "@/components/messaging/ThreadScreen";

export const metadata: Metadata = { title: "Messages • AKAL" };

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect(`/connexion?next=/messages/${id}`);

  let conversation, messages;
  try {
    [conversation, messages] = await Promise.all([fetchConversation(id), fetchMessages(id)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return <ThreadScreen conversation={conversation} messagesInitiaux={messages} utilisateurId={utilisateur.id} />;
}
