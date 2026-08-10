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
//
// Migration du 2026-07-30 (plan refresh/rotation) : demarrerConversation et
// envoyerReponse passent par fetchWithAuth() (refresh automatique sur 401)
// car ils ne sont appelés que depuis des Server Actions
// (app/actions/messaging.ts). fetchInbox, fetchConversation et fetchMessages
// restent sur un fetch simple : les trois sont aussi appelées directement
// par des Server Components (app/messages/page.tsx,
// app/messages/[id]/page.tsx) en plus de leurs Server Actions de polling —
// fetchWithAuth y lèverait la même erreur cookies().set() que l'ancien
// getCurrentUser(). /messages est de toute façon couverte par le matcher de
// proxy.ts, donc l'access_token y est déjà rafraîchi avant exécution.

import { cookies } from "next/headers";
import { ApiError, lireErreur, type Paginated } from "./api";
import { fetchWithAuth } from "./fetchWithAuth";
import type { Conversation, Message } from "@/types/messaging";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");

async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
}

async function lireOuLeverErreur(res: Response): Promise<never> {
  const { message, fieldErrors } = await lireErreur(res);
  throw new ApiError(res.status, message, fieldErrors);
}

// Appelée à la fois par app/messages/page.tsx (Server Component) et par
// fetchInboxAction (Server Action, polling) : PAS de fetchWithAuth ici (cf.
// commentaire d'en-tête).
export async function fetchInbox(): Promise<Paginated<Conversation>> {
  const res = await fetch(`${API_URL}/conversations/`, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as Paginated<Conversation>;
}

// Total des messages non lus, tous fils confondus — dérivé de fetchInbox()
// (aucun endpoint agrégé côté API, cf. MesStatistiquesAPIView côté backend
// qui fait un choix similaire). Appelée une seule fois par rendu du layout
// racine (badge Navbar, app/layout.tsx) : pas de polling ici, le polling
// reste scopé à /messages (InboxScreen). Même limite que l'inbox
// elle-même : ne couvre que la première page de fetchInbox() — acceptable
// pour un badge (compte réel plus précis visible en ouvrant /messages).
export async function fetchNombreMessagesNonLus(): Promise<number> {
  const inbox = await fetchInbox();
  return inbox.results.reduce((total, conversation) => total + conversation.messages_non_lus, 0);
}

// Résumé d'un fil (annonce, autre participant) — récupéré une seule fois au
// chargement de la page thread, jamais reinterrogé par le polling : l'annonce
// et l'identité du participant ne changent pas pendant la vie d'un fil,
// seuls les messages (fetchMessages) ont besoin d'être reconsultés. Appelée
// uniquement par app/messages/[id]/page.tsx (Server Component) : PAS de
// fetchWithAuth ici.
export async function fetchConversation(conversationId: string): Promise<Conversation> {
  const res = await fetch(`${API_URL}/conversations/${conversationId}/`, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as Conversation;
}

// Appelée à la fois par app/messages/[id]/page.tsx (Server Component) et par
// fetchMessagesAction (Server Action, polling) : PAS de fetchWithAuth ici
// (cf. commentaire d'en-tête).
export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const res = await fetch(`${API_URL}/conversations/${conversationId}/messages/`, {
    headers: { Cookie: await cookieHeader() },
    cache: "no-store",
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as Message[];
}

// Appelée uniquement depuis demarrerConversationAction (Server Action).
export async function demarrerConversation(annonceId: string, contenu: string): Promise<Conversation> {
  const res = await fetchWithAuth(`${API_URL}/conversations/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ annonce: annonceId, contenu }),
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as Conversation;
}

// Appelée uniquement depuis envoyerReponseAction (Server Action).
export async function envoyerReponse(conversationId: string, contenu: string): Promise<Message> {
  const res = await fetchWithAuth(`${API_URL}/conversations/${conversationId}/messages/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contenu }),
  });
  if (!res.ok) await lireOuLeverErreur(res);
  return (await res.json()) as Message;
}
