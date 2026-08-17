"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X, Check, MessageSquare } from "@/components/icons/Icons";
import type { Parcelle } from "@/types/parcelle";
import { formatMAD } from "@/lib/format";
import { demarrerConversationPanelAction } from "@/app/actions/messaging";

export function ContactVendeurPanel({
  parcelle,
  isOpen,
  onClose,
}: {
  parcelle: Parcelle;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [contenu, setContenu] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const { error } = await demarrerConversationPanelAction(parcelle.id, contenu);
    
    if (error) {
      setError(error);
      setPending(false);
    } else {
      setSuccess(true);
      setPending(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay sombre */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(2px)",
          zIndex: 9998,
          transition: "opacity 0.3s ease",
        }}
        onClick={onClose}
      />

      {/* Panel (Slide-over) */}
      <div
        className="akal-slide-in-right"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          maxWidth: 400,
          backgroundColor: "#fff",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.1)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--color-bordure)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "var(--color-fond)",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--color-terre)" }}>
            Contacter le vendeur
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "var(--color-tertiaire)",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Contenu */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {/* Info de l'annonce */}
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 24,
              paddingBottom: 20,
              borderBottom: "1px solid var(--color-bordure)",
            }}
          >
            <div
              style={{
                position: "relative",
                width: 64,
                height: 64,
                borderRadius: "var(--radius-sm)",
                overflow: "hidden",
                flexShrink: 0,
                backgroundColor: "var(--color-fond-input)",
              }}
            >
              {parcelle.photoPrincipale && (
                <Image src={parcelle.photoPrincipale} alt="" fill style={{ objectFit: "cover" }} sizes="64px" />
              )}
            </div>
            <div>
              <h3 style={{ fontWeight: 500, fontSize: 15, margin: "0 0 4px 0" }}>{parcelle.titre}</h3>
              <div style={{ fontSize: 14, color: "var(--color-foret)", fontWeight: 600 }}>
                {formatMAD.format(parcelle.prix)} MAD
              </div>
            </div>
          </div>

          {/* Formulaire ou Succès */}
          {success ? (
            <div className="akal-fade-in" style={{ textAlign: "center", padding: "32px 0" }}>
              <div style={{ color: "var(--color-primary)", marginBottom: 16 }}>
                <Check size={48} style={{ margin: "0 auto" }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "var(--color-terre)" }}>
                Message envoyé !
              </h3>
              <p style={{ fontSize: 14, color: "var(--color-tertiaire)", marginBottom: 32 }}>
                Le vendeur a été notifié. Vous recevrez une notification lorsqu&apos;il vous répondra.
              </p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Link href="/messages" className="btn-primary" style={{ textDecoration: "none", textAlign: "center" }}>
                  Aller à mes messages
                </Link>
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Continuer d&apos;explorer
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label htmlFor="contenu" style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
                  Votre message
                </label>
                <textarea
                  id="contenu"
                  required
                  rows={6}
                  placeholder={`Bonjour, je suis intéressé par « ${parcelle.titre} »...`}
                  className="input"
                  style={{ height: "auto", padding: "12px 16px", resize: "vertical" }}
                  value={contenu}
                  onChange={(e) => setContenu(e.target.value)}
                  autoFocus
                />
              </div>

              {error && (
                <p className="akal-alert-in" style={{ color: "var(--color-erreur)", fontSize: 14, margin: 0 }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="btn-primary"
                disabled={pending || !contenu.trim()}
                style={{ marginTop: 8, padding: 14, fontSize: 15, display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}
              >
                <MessageSquare size={16} />
                {pending ? "Envoi en cours…" : "Envoyer le message"}
              </button>
            </form>
          )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .akal-slide-in-right {
          animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}} />
    </>
  );
}
