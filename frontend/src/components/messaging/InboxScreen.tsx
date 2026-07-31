"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { fetchInboxAction } from "@/app/actions/messaging";
import { MountainEmpty } from "@/components/icons/Icons";
import type { Conversation } from "@/types/messaging";
import type { Paginated } from "@/lib/api";

// Pas de WebSocket dans ce MVP (décision F05) : l'inbox se rafraîchit par
// polling périodique plutôt que par push serveur.
const INTERVALLE_POLLING_MS = 8000;

export function InboxScreen({ inboxInitiale }: { inboxInitiale: Paginated<Conversation> | null }) {
  const [conversations, setConversations] = useState<Conversation[]>(inboxInitiale?.results ?? []);

  useEffect(() => {
    const id = setInterval(async () => {
      const resultat = await fetchInboxAction();
      if (resultat) setConversations(resultat.results);
    }, INTERVALLE_POLLING_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ maxWidth: 640, margin: "48px auto", padding: "0 24px 80px" }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Messages</h1>

      {conversations.length === 0 ? (
        <div
          className="akal-fade-in"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "80px 20px", textAlign: "center" }}
        >
          <MountainEmpty size={64} style={{ color: "var(--color-menthe)" }} />
          <p style={{ fontSize: "16px", fontWeight: 500, color: "var(--color-texte)", margin: 0 }}>
            Aucune conversation pour l&apos;instant
          </p>
          <p style={{ fontSize: "14px", color: "var(--color-secondaire)", margin: 0, maxWidth: "320px" }}>
            Contactez un vendeur depuis une fiche parcelle pour démarrer un échange.
          </p>
          <Link href="/parcelles" className="btn-secondary" style={{ textDecoration: "none" }}>
            Explorer les parcelles
          </Link>
        </div>
      ) : (
        <div className="akal-stagger" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {conversations.map((conversation) => (
            <ConversationCard key={conversation.id} conversation={conversation} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConversationCard({ conversation }: { conversation: Conversation }) {
  const nonLu = conversation.messages_non_lus > 0;

  return (
    <Link
      href={`/messages/${conversation.id}`}
      className="card"
      style={{ display: "flex", gap: 14, padding: 16, textDecoration: "none", color: "inherit", alignItems: "center" }}
    >
      <div
        style={{
          position: "relative",
          width: 56,
          height: 56,
          borderRadius: 8,
          overflow: "hidden",
          flexShrink: 0,
          backgroundColor: "var(--color-fond-input)",
        }}
      >
        {conversation.annonce.photo_principale && (
          <Image src={conversation.annonce.photo_principale} alt="" fill style={{ objectFit: "cover" }} sizes="56px" />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontWeight: nonLu ? 600 : 500, fontSize: 14 }}>{conversation.autre_participant.prenom}</span>
          <span style={{ fontSize: 12, color: "var(--color-tertiaire)", flexShrink: 0 }}>
            {formaterDate(conversation.updated_at)}
          </span>
        </div>
        <div style={{ fontSize: 13, color: "var(--color-secondaire)", marginBottom: 2 }}>{conversation.annonce.titre}</div>
        {conversation.dernier_message && (
          <div
            style={{
              fontSize: 13,
              color: nonLu ? "var(--color-texte)" : "var(--color-tertiaire)",
              fontWeight: nonLu ? 500 : 400,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {conversation.dernier_message.contenu}
          </div>
        )}
      </div>

      {nonLu && (
        <span
          className="akal-notify-dot"
          style={{
            flexShrink: 0,
            minWidth: 20,
            height: 20,
            borderRadius: "50%",
            backgroundColor: "var(--color-terre)",
            color: "white",
            fontSize: 11,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px",
          }}
        >
          {conversation.messages_non_lus}
        </span>
      )}
    </Link>
  );
}

function formaterDate(iso: string): string {
  const date = new Date(iso);
  const memeJour = date.toDateString() === new Date().toDateString();
  return memeJour
    ? date.toLocaleTimeString("fr-MA", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("fr-MA", { day: "2-digit", month: "2-digit" });
}
