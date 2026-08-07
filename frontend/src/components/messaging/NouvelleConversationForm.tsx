"use client";

import { useActionState } from "react";
import Image from "next/image";
import Link from "next/link";
import { demarrerConversationAction, type MessagingFormState } from "@/app/actions/messaging";
import type { Parcelle } from "@/types/parcelle";
import { formatMAD } from "@/lib/format";

export function NouvelleConversationForm({ parcelle }: { parcelle: Parcelle }) {
  const [state, formAction, pending] = useActionState<MessagingFormState, FormData>(
    demarrerConversationAction,
    null,
  );

  return (
    <div style={{ maxWidth: 480, margin: "48px auto", padding: "0 24px" }}>
      <div className="card akal-fade-in" style={{ padding: 24 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 20,
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
            {/* Formulaire sans titre de page jusqu'ici (revue a11y, Phase 3). */}
            <h1 style={{ fontWeight: 500, fontSize: 15, margin: 0 }}>{parcelle.titre}</h1>
            <div style={{ fontSize: 14, color: "var(--color-foret)", fontWeight: 500 }}>
              {formatMAD.format(parcelle.prix)} MAD
            </div>
          </div>
        </div>

        <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input type="hidden" name="annonce" value={parcelle.id} />

          <div>
            <label htmlFor="contenu" style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
              Votre message
            </label>
            <textarea
              id="contenu"
              name="contenu"
              required
              rows={5}
              placeholder={`Bonjour, je suis intéressé par « ${parcelle.titre} »...`}
              className="input"
              style={{ height: "auto", padding: "12px 16px", resize: "vertical" }}
            />
            {state?.fieldErrors?.contenu && (
              <p className="akal-alert-in" style={{ color: "var(--color-erreur)", fontSize: 13, marginTop: 4 }}>{state.fieldErrors.contenu[0]}</p>
            )}
          </div>

          {state?.fieldErrors?.annonce && (
            <p className="akal-alert-in" style={{ color: "var(--color-erreur)", fontSize: 14 }}>{state.fieldErrors.annonce[0]}</p>
          )}
          {state?.error && !state?.fieldErrors && <p className="akal-alert-in" style={{ color: "var(--color-erreur)", fontSize: 14 }}>{state.error}</p>}

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Link href={`/parcelles/${parcelle.slug}`} className="btn-secondary" style={{ textDecoration: "none" }}>
              Annuler
            </Link>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
