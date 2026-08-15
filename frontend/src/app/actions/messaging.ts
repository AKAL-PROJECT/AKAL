"use server";

import { redirect } from "next/navigation";
import { ApiError, type FieldErrors, type Paginated } from "@/lib/api";
import { demarrerConversation, envoyerReponse, fetchInbox, fetchMessages } from "@/lib/messaging-api";
import type { Conversation, Message } from "@/types/messaging";

export type MessagingFormState = {
  error: string;
  fieldErrors: FieldErrors | null;
} | null;

function etatErreur(err: unknown): MessagingFormState {
  if (err instanceof ApiError) return { error: err.message, fieldErrors: err.fieldErrors };
  return { error: "Une erreur est survenue. Réessayez.", fieldErrors: null };
}

// Étape compose (/messages/nouveau) — redirect() est appelé hors du
// try/catch (comme loginAction/signupAction) : jamais intercepté par le
// catch, pas besoin d'unstable_rethrow ici.
export async function demarrerConversationAction(
  _prevState: MessagingFormState,
  formData: FormData,
): Promise<MessagingFormState> {
  const annonceId = String(formData.get("annonce") ?? "");
  const contenu = String(formData.get("contenu") ?? "");

  let conversation: Conversation;
  try {
    conversation = await demarrerConversation(annonceId, contenu);
  } catch (err) {
    return etatErreur(err);
  }
  redirect(`/messages/${conversation.id}`);
}

// Répondre dans un fil déjà ouvert — appelée impérativement depuis le
// composant client du thread (pas useActionState : la vue a besoin du
// message créé immédiatement pour l'afficher sans attendre le prochain poll).
export async function envoyerReponseAction(
  conversationId: string,
  contenu: string,
): Promise<{ message: Message | null; error: string | null }> {
  try {
    const message = await envoyerReponse(conversationId, contenu);
    return { message, error: null };
  } catch (err) {
    return { message: null, error: etatErreur(err)?.error ?? "Erreur inconnue." };
  }
}

// Action sans redirection, utilisée par le ContactVendeurPanel (Slide-over)
// pour garder l'acheteur sur la page de l'annonce.
export async function demarrerConversationPanelAction(
  annonceId: string,
  contenu: string,
): Promise<{ conversation: Conversation | null; error: string | null }> {
  try {
    const conversation = await demarrerConversation(annonceId, contenu);
    return { conversation, error: null };
  } catch (err) {
    return { conversation: null, error: etatErreur(err)?.error ?? "Erreur inconnue." };
  }
}

// Polling (décision F05 : pas de WebSocket) — appelées à intervalle depuis
// useEffect côté client. Renvoient null en cas d'échec plutôt que de lever :
// un poll raté ne doit jamais casser l'affichage, juste être ignoré jusqu'au
// suivant.
export async function fetchInboxAction(): Promise<Paginated<Conversation> | null> {
  try {
    return await fetchInbox();
  } catch {
    return null;
  }
}

export async function fetchMessagesAction(conversationId: string): Promise<Message[] | null> {
  try {
    return await fetchMessages(conversationId);
  } catch {
    return null;
  }
}
