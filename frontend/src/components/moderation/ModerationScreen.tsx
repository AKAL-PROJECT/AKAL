"use client";

// Dashboard modérateur (/moderation, 2026-10-01) — valider/rejeter une
// annonce `en_attente`. Pas de modale de confirmation contrôlée (contr.
// app/(espace-perso)/compte/annonces/ListeAnnonces.tsx) : les deux actions
// sont réversibles l'une par l'autre côté modération (une annonce rejetée
// par erreur reste modifiable par son propriétaire puis revient dans cette
// même file), contrairement à archiver/marquer vendue qui ferment un cycle
// de vie — le risque justifiant cette modale n'existe pas ici.
//
// `enCours` verrouille uniquement la carte concernée (pas toute la liste,
// contrairement à ListeAnnonces.tsx) : deux modérateurs ou deux décisions
// indépendantes sur deux annonces différentes n'ont aucune raison de se
// bloquer l'une l'autre.
import { useState } from "react";
import Image from "next/image";
import { EtatVide } from "@/components/EtatVide";
import { Check, X } from "@/components/icons/Icons";
import {
  rejeterAnnonceAction,
  validerAnnonceAction,
  type ActionModerationResultat,
} from "@/app/actions/moderation";
import type { AnnonceModerationDTO } from "@/lib/moderation-api";

const formatMAD = new Intl.NumberFormat("fr-MA");

export function ModerationScreen({ annoncesInitiales }: { annoncesInitiales: AnnonceModerationDTO[] }) {
  const [items, setItems] = useState(annoncesInitiales);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function decider(id: string, action: (id: string) => Promise<ActionModerationResultat>) {
    if (enCours) return;
    setErreur(null);
    setEnCours(id);
    const resultat = await action(id);
    setEnCours(null);
    if (resultat.ok) {
      setItems((prev) => prev.filter((a) => a.id !== id));
    } else {
      setErreur(resultat.error);
    }
  }

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 600, color: "var(--color-nuit)", marginBottom: "4px" }}>
        Modération
      </h1>
      <p style={{ fontSize: "14px", color: "var(--color-tertiaire)", marginBottom: "24px" }}>
        {items.length} annonce{items.length === 1 ? "" : "s"} en attente de validation.
      </p>

      {erreur && (
        <p
          className="akal-alert-in"
          style={{
            color: "var(--color-erreur)",
            fontSize: 14,
            backgroundColor: "var(--color-erreur-fond)",
            border: "1px solid var(--color-erreur)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 14px",
            marginBottom: 16,
          }}
        >
          {erreur}
        </p>
      )}

      {items.length === 0 ? (
        <EtatVide titre="File vide" description="Aucune annonce en attente de modération pour l'instant." />
      ) : (
        <div className="akal-stagger" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {items.map((a) => (
            <div
              key={a.id}
              className="card"
              style={{ display: "flex", gap: "16px", padding: "16px", flexWrap: "wrap", alignItems: "center" }}
            >
              <div
                style={{
                  position: "relative",
                  width: "88px",
                  height: "88px",
                  flexShrink: 0,
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                  backgroundColor: "var(--color-menthe)",
                }}
              >
                {a.photo_principale && (
                  <Image src={a.photo_principale} alt={a.titre} fill sizes="88px" style={{ objectFit: "cover" }} />
                )}
              </div>

              <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-texte)", margin: 0 }}>
                  {a.titre}
                </h3>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-foret)" }}>
                  {formatMAD.format(a.prix_mad)} MAD
                </span>
                {a.motif_moderation && (
                  <p style={{ fontSize: "13px", color: "var(--color-erreur)", margin: 0 }}>⚠ {a.motif_moderation}</p>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: "6px 14px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  disabled={enCours === a.id}
                  onClick={() => decider(a.id, validerAnnonceAction)}
                >
                  <Check size={14} /> Valider
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: "6px 14px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  disabled={enCours === a.id}
                  onClick={() => decider(a.id, rejeterAnnonceAction)}
                >
                  <X size={14} /> Rejeter
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
