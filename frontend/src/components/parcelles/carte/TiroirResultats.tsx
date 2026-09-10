"use client";

import Image from "next/image";
import type { Parcelle } from "@/types/parcelle";
import BadgeStatut from "@/components/parcelles/BadgeStatut";
import { ChevronLeft, ChevronRight, MapPin } from "@/components/icons/Icons";
import { formatMAD } from "@/lib/format";

// Tiroir de résultats de la carte plein écran (/carte — design 1c). Rétractable
// (chevron d'en-tête), liste triée par proximité au centre de la carte (le tri
// se fait côté page, cf. app/carte/page.tsx), une carte = une sélection
// (le repère de carte et la fiche de contact en dérivent, source unique).
export default function TiroirResultats({
  parcelles,
  total,
  chargement,
  parcelleActiveId,
  onSelectionner,
  ouvert,
  onToggle,
  estMobile,
}: {
  parcelles: Parcelle[];
  total: number;
  chargement: boolean;
  parcelleActiveId: string | null;
  onSelectionner: (id: string) => void;
  ouvert: boolean;
  onToggle: () => void;
  estMobile: boolean;
}) {
  const compte = parcelles.length;
  const libelleCompte = chargement && compte === 0
    ? "Chargement…"
    : `${compte} annonce${compte > 1 ? "s" : ""}`;

  // Replié : un onglet flottant pour rouvrir.
  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="akal-focusable"
        style={{
          position: "absolute",
          left: "16px",
          top: "72px",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 16px",
          borderRadius: "var(--radius-full)",
          border: "none",
          backgroundColor: "white",
          boxShadow: "var(--shadow-2)",
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--color-nuit)",
          cursor: "pointer",
        }}
      >
        <ChevronRight size={16} />
        {libelleCompte}
      </button>
    );
  }

  return (
    <aside
      aria-label="Résultats de la zone"
      style={{
        position: "absolute",
        left: "16px",
        top: "72px",
        bottom: estMobile ? "auto" : "16px",
        maxHeight: estMobile ? "52dvh" : undefined,
        width: estMobile ? "calc(100% - 32px)" : "330px",
        maxWidth: "calc(100% - 32px)",
        zIndex: 1000,
        backgroundColor: "white",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-3)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--color-fond-input)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-nuit)" }}>
            Résultats de la zone
          </div>
          <div style={{ fontSize: "12.5px", color: "var(--color-tertiaire)", marginTop: "3px" }}>
            {chargement && compte === 0
              ? "Chargement des annonces…"
              : `${libelleCompte}${total > compte ? ` sur ${total}` : ""} · triées par proximité`}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Replier les résultats"
          className="akal-focusable"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-tertiaire)",
            display: "flex",
            flexShrink: 0,
          }}
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {chargement && compte === 0 ? (
          <div style={{ padding: "24px 8px", textAlign: "center", fontSize: "13px", color: "var(--color-tertiaire)" }}>
            Chargement des annonces…
          </div>
        ) : compte === 0 ? (
          <div
            style={{
              padding: "24px 8px",
              textAlign: "center",
              fontSize: "13px",
              color: "var(--color-tertiaire)",
              lineHeight: 1.6,
            }}
          >
            Aucune annonce dans cette zone.
            <br />
            Déplacez la carte ou élargissez les filtres.
          </div>
        ) : (
          parcelles.map((p) => {
            const actif = p.id === parcelleActiveId;
            const image = p.photoPrincipale ?? p.photos[0] ?? null;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectionner(p.id)}
                aria-pressed={actif}
                className="akal-focusable"
                style={{
                  // README design 1c : sans `flex: none`, dans une colonne flex
                  // scrollable les cartes se compriment au lieu de faire défiler.
                  flex: "none",
                  display: "block",
                  width: "100%",
                  padding: 0,
                  textAlign: "left",
                  cursor: "pointer",
                  overflow: "hidden",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: actif ? "var(--color-rosee)" : "white",
                  border: actif ? "1.5px solid var(--color-foret)" : "1px solid var(--color-bordure)",
                  transition: "border-color 150ms ease, background-color 150ms ease",
                }}
              >
                <div style={{ position: "relative", height: "96px", backgroundColor: "var(--color-menthe)" }}>
                  {image && (
                    <Image src={image} alt="" fill sizes="330px" style={{ objectFit: "cover" }} />
                  )}
                  <span style={{ position: "absolute", top: "8px", left: "8px" }}>
                    <BadgeStatut statut={p.parcelle.statutFoncier} />
                  </span>
                </div>
                <div style={{ padding: "11px 13px 13px", display: "flex", flexDirection: "column", gap: "5px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, lineHeight: 1.35, color: "var(--color-nuit)" }}>
                    {p.titre}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "12.5px",
                      color: "var(--color-tertiaire)",
                    }}
                  >
                    <MapPin size={12} />
                    {p.parcelle.regionNom}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: "10px",
                      marginTop: "2px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "var(--color-foret)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatMAD.format(p.prix)} MAD
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--color-tertiaire)" }}>
                      {p.parcelle.surface} ha
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
