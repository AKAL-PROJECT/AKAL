"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AccesEau } from "@/types/parcelle";
import { useAgriScoreResume } from "@/hooks/useAgriScoreResume";
import { DIMENSIONS, type Passeport } from "@/lib/passeport-api";
import { bandeScore, couleurTon, LIBELLE_DIMENSION, verdict } from "@/lib/passeport-presentation";

type Props = {
  parcelleId: string; // UUID de la Parcelle (≠ id annonce) — cf. lib/passeport-api.ts
  slug: string; // routing vers /parcelles/<slug>/passeport
  accesEau: AccesEau | null;
  // "compact" (défaut) : une ligne, pour la carte catalogue — grille dense,
  // 12 à 50 cartes à la fois. "detaille" : + une ligne de sous-scores, pour
  // la fiche et le comparateur, où il y a la place et l'intention de
  // regarder de plus près.
  variante?: "compact" | "detaille";
  // Comparateur uniquement : remonte le score résolu au parent, pour que
  // ComparateurScreen puisse continuer à surligner la meilleure valeur de la
  // ligne AgriScore comme il le fait déjà pour prix/surface. Appelé une
  // seule fois par résolution (jamais pendant l'état "chargement").
  onScore?: (score: number | null) => void;
};

// Résumé compact de l'AgriScore d'une parcelle — carte catalogue, fiche
// annonce, comparateur. Toujours cliquable vers le passeport complet, y
// compris pendant le chargement ou à l'état indisponible : la destination
// (/parcelles/<slug>/passeport) ne dépend pas du résultat du fetch, autant
// laisser l'utilisateur y aller tout de suite plutôt que d'attendre.
//
// Un <button> + router.push(), jamais un <Link> : sur CardParcelle, ce
// composant est monté À L'INTÉRIEUR du <Link> plein-carte existant vers la
// fiche (cf. CardParcelle.tsx) — un <a> imbriqué dans un <a> serait du HTML
// invalide. Même traitement que le bouton favori et la case "Comparer" du
// même fichier (stopPropagation, pas de lien imbriqué), volontairement
// identique dans les 3 contextes (fiche, comparateur) plutôt que deux
// implémentations différentes selon l'appelant.
export default function AgriScoreResume({ parcelleId, slug, accesEau, variante = "compact", onScore }: Props) {
  const etat = useAgriScoreResume(parcelleId);
  const router = useRouter();

  useEffect(() => {
    if (etat.statut === "ok") onScore?.(etat.passeport.scoreGlobal);
    else if (etat.statut === "indisponible") onScore?.(null);
  }, [etat, onScore]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        router.push(`/parcelles/${slug}/passeport`);
      }}
      aria-label="Voir le passeport agronomique complet"
      className="akal-focusable"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        alignItems: "flex-start",
        background: "none",
        border: "none",
        padding: 0,
        margin: 0,
        font: "inherit",
        textAlign: "left",
        cursor: "pointer",
        position: "relative",
        zIndex: 2,
      }}
    >
      {etat.statut === "chargement" && <LigneChargement />}
      {etat.statut === "indisponible" && <LigneIndisponible />}
      {etat.statut === "ok" && (
        <LigneScore score={etat.passeport.scoreGlobal} accesEau={accesEau} />
      )}
      {etat.statut === "ok" && variante === "detaille" && (
        <LigneSousScores passeport={etat.passeport} />
      )}
    </button>
  );
}

// Même mécanisme que CardParcelleSkeleton (shimmer, pas un blink) — cohérent
// avec le reste de la grille catalogue plutôt qu'une seconde animation de
// chargement introduite pour ce seul composant.
function LigneChargement() {
  return (
    <div
      aria-hidden
      className="skeleton-shimmer"
      style={{
        height: "14px",
        width: "70%",
        borderRadius: "var(--radius-xs)",
        backgroundColor: "var(--color-skeleton-base, var(--color-menthe))",
      }}
    />
  );
}

function LigneIndisponible() {
  return (
    <span style={{ fontSize: "12px", color: "var(--color-tertiaire)" }}>
      🌱 Analyse agronomique indisponible
    </span>
  );
}

function LigneScore({ score, accesEau }: { score: number | null; accesEau: AccesEau | null }) {
  const couleur = couleurTon(bandeScore(score).ton);
  const texte = score === null ? verdict(score, accesEau) : `AgriScore ${Math.round(score)}/100 — ${verdict(score, accesEau)}`;
  return (
    <span style={{ fontSize: "12px", fontWeight: 500, color: couleur }}>
      🌱 {texte}
    </span>
  );
}

// Une entrée par dimension ok, dans l'ordre canonique (poids décroissant) —
// omise si indisponible, jamais un "NaN" ou un tiret ambigu affiché ici (le
// détail complet, y compris les dimensions indisponibles, reste sur la page
// passeport).
function LigneSousScores({ passeport }: { passeport: Passeport }) {
  const entrees = DIMENSIONS.map((cle) => {
    const dim = passeport.dimensions[cle];
    if (dim.statut !== "ok" || dim.sousScore === null) return null;
    return `${LIBELLE_DIMENSION[cle].court} ${Math.round(dim.sousScore)}`;
  }).filter((x): x is string => x !== null);

  if (entrees.length === 0) return null;

  return (
    <span style={{ fontSize: "11px", color: "var(--color-tertiaire)" }}>
      {entrees.join(" · ")}
    </span>
  );
}
