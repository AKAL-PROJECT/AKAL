"use client";

import Image from "next/image";
import type { Parcelle } from "@/types/parcelle";
import { X } from "@/components/icons/Icons";

type Props = {
  parcelles: Parcelle[];
  onRetirer: (id: string) => void;
};

export default function BarreComparateur({ parcelles, onRetirer }: Props) {
  if (parcelles.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        backgroundColor: "var(--color-nuit)",
        boxShadow: "0 -4px 16px rgba(0,0,0,0.25)",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: "14px", fontWeight: 500, color: "white", whiteSpace: "nowrap" }}>
        {parcelles.length}/3 sélectionnées
      </span>

      {/* Miniatures empilées */}
      <div style={{ display: "flex", alignItems: "center", flex: 1, flexWrap: "wrap", minWidth: "160px", gap: "10px" }}>
        <div style={{ display: "flex" }}>
          {parcelles.map((p, i) => {
            const image = p.photoPrincipale ?? p.photos[0] ?? null;
            return (
              <div
                key={p.id}
                style={{
                  position: "relative",
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "2px solid var(--color-nuit)",
                  backgroundColor: "var(--color-menthe)",
                  marginLeft: i === 0 ? 0 : "-12px",
                  flexShrink: 0,
                }}
                title={p.titre}
              >
                {image && <Image src={image} alt={p.titre} fill sizes="36px" style={{ objectFit: "cover" }} />}
                <button
                  type="button"
                  onClick={() => onRetirer(p.id)}
                  aria-label={`Retirer ${p.titre} de la comparaison`}
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(27,58,45,0)",
                    border: "none",
                    cursor: "pointer",
                    color: "transparent",
                    transition: "background-color 150ms ease, color 150ms ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(27,58,45,0.65)";
                    e.currentTarget.style.color = "white";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(27,58,45,0)";
                    e.currentTarget.style.color = "transparent";
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {parcelles.map((p) => (
            <span
              key={p.id}
              className="hidden-mobile"
              style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)" }}
            >
              {p.titre.length > 22 ? p.titre.slice(0, 22) + "…" : p.titre}
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={parcelles.length < 2}
        style={{
          padding: "12px 24px",
          fontSize: "14px",
          fontWeight: 500,
          color: "white",
          backgroundColor: "var(--color-prairie)",
          borderRadius: "var(--radius-btn)",
          border: "none",
          cursor: parcelles.length < 2 ? "default" : "pointer",
          opacity: parcelles.length < 2 ? 0.5 : 1,
          whiteSpace: "nowrap",
          transition: "opacity 200ms ease",
        }}
      >
        Comparer maintenant
      </button>
    </div>
  );
}
