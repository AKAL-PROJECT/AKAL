"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft } from "@/components/icons/Icons";
import { envoyerReponseAction, fetchMessagesAction } from "@/app/actions/messaging";
import type { Conversation, Message } from "@/types/messaging";

// Pas de WebSocket dans ce MVP (décision F05) : le fil se rafraîchit par
// polling périodique. Intervalle plus court que l'inbox (5s vs 8s) — un fil
// ouvert est un contexte plus « actif », l'utilisateur attend une réponse.
const INTERVALLE_POLLING_MS = 5000;

// Distance (px) au bas du conteneur en dessous de laquelle on considère que
// l'utilisateur « suit » la conversation. Un nouveau message reçu l'amène
// alors en bas ; au-delà (il consulte l'historique), on ne le téléporte pas
// (audit visuel, correctif P0.1 — étape 6).
const SEUIL_PRES_DU_BAS_PX = 80;

export function ThreadScreen({
  conversation,
  messagesInitiaux,
  utilisateurId,
}: {
  conversation: Conversation;
  messagesInitiaux: Message[];
  utilisateurId: string;
}) {
  const [messages, setMessages] = useState<Message[]>(messagesInitiaux);
  const [contenu, setContenu] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Conteneur des messages — seul élément scrollable du fil (cf. le div
  // flex:1/overflowY:auto plus bas). Le scroll vers le bas s'écrit
  // directement dessus (scrollTop/scrollTo) plutôt que via
  // Element.scrollIntoView() sur un repère : scrollIntoView() remonte le
  // premier ancêtre scrollable qu'il trouve, qui était body/html dès que ce
  // conteneur n'avait lui-même pas besoin de scroller (conversation courte)
  // — la page entière défilait alors au lieu du seul fil (audit visuel,
  // correctif P0.1).
  const messagesRef = useRef<HTMLDivElement>(null);
  const presDuBasRef = useRef(true);
  const premierRenduRef = useRef(true);

  useEffect(() => {
    const id = setInterval(async () => {
      const resultat = await fetchMessagesAction(conversation.id);
      if (resultat) setMessages(resultat);
    }, INTERVALLE_POLLING_MS);
    return () => clearInterval(id);
  }, [conversation.id]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;

    const dernierMessage = messages[messages.length - 1];
    const estMonMessage = dernierMessage?.auteur.id === utilisateurId;

    if (premierRenduRef.current) {
      // Ouverture de la conversation : en bas immédiatement, sans animation
      // — l'utilisateur ne doit jamais percevoir de saut, ni voir la page
      // « vide » le temps que le scroll s'exécute.
      el.scrollTop = el.scrollHeight;
      premierRenduRef.current = false;
      return;
    }

    // Nouveau message : on suit uniquement si l'utilisateur était déjà en
    // bas, ou si c'est son propre envoi. Sinon (il relit l'historique), on
    // ne le déplace pas.
    if (presDuBasRef.current || estMonMessage) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, utilisateurId]);

  function onScrollMessages() {
    const el = messagesRef.current;
    if (!el) return;
    const distanceAuBas = el.scrollHeight - el.scrollTop - el.clientHeight;
    presDuBasRef.current = distanceAuBas < SEUIL_PRES_DU_BAS_PX;
  }

  function envoyer(e: React.FormEvent) {
    e.preventDefault();
    const texte = contenu.trim();
    if (!texte) return;

    setErreur(null);
    startTransition(async () => {
      const resultat = await envoyerReponseAction(conversation.id, texte);
      if (resultat.message) {
        const nouveauMessage = resultat.message;
        presDuBasRef.current = true; // mon propre envoi doit toujours amener en bas
        setMessages((prev) => [...prev, nouveauMessage]);
        setContenu("");
      } else {
        setErreur(resultat.error);
      }
    });
  }

  return (
    <div
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "0 24px",
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 64px)",
        // Panneau plein écran contenu : seul le conteneur des messages
        // ci-dessous scrolle (overflowY:auto) — celui-ci ne doit jamais
        // déborder sur body (correctif P0.1).
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 0", borderBottom: "1px solid var(--color-bordure)", flexShrink: 0 }}>
        <Link href="/messages" style={{ color: "var(--color-texte)", display: "flex" }}>
          <ChevronLeft size={20} />
        </Link>
        <div
          style={{
            position: "relative",
            width: 40,
            height: 40,
            borderRadius: 8,
            overflow: "hidden",
            flexShrink: 0,
            backgroundColor: "var(--color-fond-input)",
          }}
        >
          {conversation.annonce.photo_principale && (
            <Image src={conversation.annonce.photo_principale} alt="" fill style={{ objectFit: "cover" }} sizes="40px" />
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          {/* Fil sans titre de page jusqu'ici (revue a11y, Phase 3). */}
          <h1 style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>{conversation.autre_participant.prenom}</h1>
          <Link
            href={`/parcelles/${conversation.annonce.slug}`}
            style={{
              fontSize: 12,
              color: "var(--color-secondaire)",
              textDecoration: "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
            }}
          >
            {conversation.annonce.titre}
          </Link>
        </div>
      </div>

      <div
        ref={messagesRef}
        onScroll={onScrollMessages}
        style={{ flex: 1, overflowY: "auto", padding: "16px 0", display: "flex", flexDirection: "column", gap: 10 }}
      >
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} estMoi={message.auteur.id === utilisateurId} />
        ))}
      </div>

      <form onSubmit={envoyer} style={{ display: "flex", gap: 8, padding: "12px 0 8px", borderTop: "1px solid var(--color-bordure)", flexShrink: 0 }}>
        <input
          type="text"
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          placeholder="Écrire un message…"
          className="input"
          disabled={pending}
        />
        <button type="submit" className="btn-primary" disabled={pending || !contenu.trim()}>
          {pending ? "Envoi…" : "Envoyer"}
        </button>
      </form>
      {erreur && <p className="akal-alert-in" style={{ color: "var(--color-erreur)", fontSize: 13, margin: "0 0 16px" }}>{erreur}</p>}
    </div>
  );
}

function MessageBubble({ message, estMoi }: { message: Message; estMoi: boolean }) {
  return (
    <div className="akal-fade-in" style={{ display: "flex", justifyContent: estMoi ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "75%",
          padding: "10px 14px",
          borderRadius: 14,
          backgroundColor: estMoi ? "var(--color-foret)" : "var(--color-fond-input)",
          color: estMoi ? "white" : "var(--color-texte)",
          fontSize: 14,
          lineHeight: 1.4,
        }}
      >
        {message.contenu}
      </div>
    </div>
  );
}
