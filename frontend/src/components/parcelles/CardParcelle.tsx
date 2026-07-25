"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Parcelle } from "@/types/parcelle";
import BadgeStatut from "./BadgeStatut";
import ScoreBar from "./ScoreBar";
import { MapPin, Heart, Droplets } from "@/components/icons/Icons";

type Props = {
  parcelle: Parcelle;
  enComparaison: boolean;
  onToggleComparaison: (id: string) => void;
  // Position dans la grille — pilote le délai de l'entrée en cascade
  // (.akal-card-cascade, globals.css). Optionnel : une carte isolée hors
  // grille (ex. future page "favoris") s'anime simplement sans délai.
  index?: number;
};

const formatMAD = new Intl.NumberFormat("fr-MA");

export default function CardParcelle({ parcelle, enComparaison, onToggleComparaison, index }: Props) {
  const [favori, setFavori] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const a = parcelle;
  const image = a.photoPrincipale ?? a.photos[0] ?? null;

  // Zoom léger de la photo au survol — mutation directe du style (même
  // convention que Navbar.tsx) plutôt qu'un state React, pour rester fluide.
  const zoomer = (actif: boolean) => {
    if (imgRef.current) imgRef.current.style.transform = actif ? "scale(1.05)" : "scale(1)";
  };

  return (
    <article
      className="card akal-card-cascade"
      style={{
        overflow: "hidden",
        animationDelay: index != null ? `${(index % 9) * 60}ms` : undefined,
      }}
    >
      {/* Photo */}
      <div
        style={{ position: "relative", width: "100%", height: "180px", backgroundColor: "var(--color-menthe)", overflow: "hidden" }}
        onMouseEnter={() => zoomer(true)}
        onMouseLeave={() => zoomer(false)}
      >
        {image && (
          <Image
            ref={imgRef}
            src={image}
            alt={a.titre}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            style={{ objectFit: "cover", transition: "transform 300ms ease" }}
          />
        )}

        {/* Badges en surimpression */}
        <div
          style={{
            position: "absolute",
            top: "8px",
            left: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            alignItems: "flex-start",
          }}
        >
          {a.badge && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 500,
                padding: "2px 8px",
                borderRadius: "999px",
                color: "white",
                backgroundColor: "var(--color-foret)",
              }}
            >
              {a.badge}
            </span>
          )}
          <BadgeStatut statut={a.parcelle.statutFoncier} />
        </div>

        {/* Favori — favoris non branchés côté back pour l'instant : visuel
            décoratif local (aucun appel API, aucune persistance). */}
        <button
          type="button"
          aria-label={favori ? "Retirer des favoris" : "Ajouter aux favoris"}
          aria-pressed={favori}
          onClick={() => setFavori((v) => !v)}
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            width: "28px",
            height: "28px",
            borderRadius: "999px",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.9)",
            transition: "background-color 200ms ease",
          }}
        >
          <Heart
            size={14}
            fill={favori ? "var(--color-terre)" : "none"}
            style={{ color: favori ? "var(--color-terre)" : "var(--color-tertiaire)" }}
          />
        </button>
      </div>

      {/* Corps */}
      <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <Link href={`/parcelles/${a.slug}`} style={{ textDecoration: "none" }}>
          <h3 style={{ fontSize: "14px", fontWeight: 500, lineHeight: 1.3, color: "var(--color-foret)" }}>
            {a.titre}
          </h3>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--color-tertiaire)" }}>
          <MapPin size={13} />
          {/* Pas d'adresse approximative en liste (allégé, contrat §4.4) — région seule ici. */}
          <span>{a.parcelle.regionNom}</span>
        </div>

        {/* Tags */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          {[`${a.parcelle.surface} ha`, `${a.prixM2} MAD/m²`].map((t) => (
            <span
              key={t}
              style={{
                fontSize: "10px",
                fontWeight: 500,
                padding: "2px 8px",
                borderRadius: "999px",
                backgroundColor: "var(--color-menthe)",
                color: "var(--color-nuit)",
              }}
            >
              {t}
            </span>
          ))}
          {a.parcelle.accesEau !== "bour" && (
            <Droplets size={13} style={{ color: "#2196F3" }} aria-label="Accès à l'eau" />
          )}
        </div>

        {/* Prix + comparateur */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "4px" }}>
          <span style={{ fontSize: "16px", fontWeight: 500, color: "var(--color-foret)", fontVariantNumeric: "tabular-nums" }}>
            {formatMAD.format(a.prix)} MAD
          </span>
          <label
            style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", fontSize: "11px", color: "var(--color-tertiaire)" }}
          >
            <input
              type="checkbox"
              checked={enComparaison}
              onChange={() => onToggleComparaison(a.id)}
              style={{ width: "13px", height: "13px", accentColor: "var(--color-foret)" }}
            />
            Comparer
          </label>
        </div>

        {/* AgriScore — absent du prototype statique (§ "pas de bloc score"),
            réintégré ici en pied de carte : c'est une donnée réelle du back
            (contrat §3.5), pas un concept du mockup à recréer à l'identique. */}
        <ScoreBar score={a.scoreCourant?.scoreGlobal ?? null} />
      </div>
    </article>
  );
}
