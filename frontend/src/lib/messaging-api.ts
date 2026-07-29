// Client d'écriture/lecture pour la messagerie (F05) — utilisable uniquement
// côté serveur (Server Actions), même raison que lib/annonces-api.ts et
// lib/auth-api.ts : SIMPLE_JWT['AUTH_COOKIE_SAMESITE'] est 'Lax' en dev, un
// fetch() direct depuis le navigateur (origine différente) n'attacherait
// jamais le cookie d'auth. On lit/renvoie donc explicitement les cookies de
// la requête entrante ici.
//
// Polling (décision F05 : pas de WebSocket) : fetchInbox/fetchMessages sont
// de simples fonctions appelables à intervalle depuis un composant client,
// via les Server Actions de app/actions/messaging.ts — pas besoin de Route
// Handler, une Server Action s'appelle aussi bien en boucle qu'une seule fois.

import { cookies } from "next/headers";
import { ApiError, lireErreur, type Paginated } from "./api";
import type { Conversation, Message } from "@/types/messaging";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");

async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
}

async function csrfHeader(): Promise<Record<string, string>> {
  const jar = await cookies();
  const token = jar.get("csrftoken")?.value;
  return token ? { "X-CSRFToken": token } : {};
}

async function lireOuLeverErreur(res: Response): Promise<never> {
  const { message, fieldErrors } = await lireErreur(res);
  throw new ApiError(res.status, message, fieldErrors);
}

export async function fetchInbox(): Promise<Paginated<Conversation>> {
  const res = await fetch(`${API_URL}/conversations/`, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as Paginated<Conversation>;
}

// Résumé d'un fil (annonce, autre participant) — récupéré une seule fois au
// chargement de la page thread, jamais reinterrogé par le polling : l'annonce
// et l'identité du participant ne changent pas pendant la vie d'un fil,
// seuls les messages (fetchMessages) ont besoin d'être reconsultés.
export async function fetchConversation(conversationId: string): Promise<Conversation> {
  const res = await fetch(`${API_URL}/conversations/${conversationId}/`, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as Conversation;
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const res = await fetch(`${API_URL}/conversations/${conversationId}/messages/`, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as Message[];
}

export async function demarrerConversation(annonceId: string, contenu: string): Promise<Conversation> {
  const res = await fetch(`${API_URL}/conversations/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: await cookieHeader(),
      ...(await csrfHeader()),
    },
    body: JSON.stringify({ annonce: annonceId, contenu }),
    cache: "no-store",
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as Conversation;
}

export async function envoyerReponse(conversationId: string, contenu: string): Promise<Message> {
  const res = await fetch(`${API_URL}/conversations/${conversationId}/messages/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: await cookieHeader(),
      ...(await csrfHeader()),
    },
    body: JSON.stringify({ contenu }),
    cache: "no-store",
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as Message;
}
