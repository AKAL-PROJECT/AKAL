"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { Parcelle } from "@/types/parcelle";
import { X } from "@/components/icons/Icons";
import { COMPARATEUR_MAX } from "./comparateurStorage";

type Props = {
  parcelles: Parcelle[];
  onRetirer: (id: string) => void;
};

export default function BarreComparateur({ parcelles, onRetirer }: Props) {
  const router = useRouter();

  if (parcelles.length === 0) return null;

  // `parcelles` est déjà la sélection persistée (useComparateur écrit dans
  // sessionStorage à chaque ajout/retrait, cf. hooks/useComparateur.ts) —
  // rien à écrire ici, seulement naviguer.
  const ouvrirComparateur = () => router.push("/comparateur");

  return (
    <div
      className="akal-bar-in"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        backgroundColor: "var(--color-nuit)",
        boxShadow: "0 -4px 16px rgba(17,26,21,0.28)",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: "14px", fontWeight: 500, color: "white", whiteSpace: "nowrap" }}>
        {parcelles.length}/{COMPARATEUR_MAX} sélectionnées
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
                  borderRadius: "var(--radius-sm)",
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
                  className="btn-retirer-comparateur"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    cursor: "pointer",
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

      {parcelles.length < 2 ? (
        <button
          type="button"
          disabled
          style={{
            padding: "12px 24px",
            fontSize: "14px",
            fontWeight: 500,
            color: "white",
            backgroundColor: "var(--color-prairie)",
            borderRadius: "var(--radius-btn)",
            border: "none",
            cursor: "default",
            opacity: 0.5,
            whiteSpace: "nowrap",
          }}
        >
          Comparer maintenant
        </button>
      ) : (
        <button
          type="button"
          onClick={ouvrirComparateur}
          className="btn-cta-verte akal-focusable"
          style={{
            padding: "12px 24px",
            fontSize: "14px",
            fontWeight: 500,
            color: "white",
            backgroundColor: "var(--color-prairie)",
            borderRadius: "var(--radius-btn)",
            border: "none",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Comparer maintenant
        </button>
      )}
    </div>
  );
}
