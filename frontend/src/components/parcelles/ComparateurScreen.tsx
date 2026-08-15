"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import type { AccesEau, Parcelle } from "@/types/parcelle";
import BadgeStatut from "./BadgeStatut";
import ScoreBar from "./ScoreBar";
import { MapPin, X } from "@/components/icons/Icons";
import { EtatVide } from "@/components/EtatVide";
import { useComparateur } from "@/hooks/useComparateur";
import { AGRISCORE_ACTIF } from "@/config/features";
import { formatMAD } from "@/lib/format";

// Leaflet a besoin de `window`, absent au rendu serveur — même contrainte
// que CarteParcelles.tsx.
const CarteComparateur = dynamic(() => import("./CarteComparateur"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--color-menthe)",
        borderRadius: "var(--radius-card)",
        color: "var(--color-foret)",
        fontSize: "14px",
      }}
    >
      Chargement de la carte…
    </div>
  ),
});

const ACCES_EAU_LABEL: Record<AccesEau, string> = {
  irriguee: "Irriguée",
  bour: "Bour",
  mixte: "Mixte",
};

type Ligne = {
  label: string;
  // Valeur numérique comparable pour déterminer la "meilleure" (null = non comparable).
  valeur: (p: Parcelle) => number | null;
  meilleure?: "max" | "min";
  render: (p: Parcelle) => React.ReactNode;
};

const LIGNES: Ligne[] = [
  { label: "Prix", valeur: (p) => p.prix, meilleure: "min", render: (p) => `${formatMAD.format(p.prix)} MAD` },
  { label: "Prix au m²", valeur: (p) => p.prixM2, meilleure: "min", render: (p) => `${formatMAD.format(p.prixM2)} MAD/m²` },
  { label: "Surface", valeur: (p) => p.parcelle.surface, meilleure: "max", render: (p) => `${p.parcelle.surface} ha` },
  // AgriScore hors périmètre produit actuel (cf. src/config/features.ts) —
  // ligne conservée, simplement exclue du tableau tant que le flag est faux.
  ...(AGRISCORE_ACTIF
    ? [{
        label: "AgriScore",
        valeur: (p: Parcelle) => p.scoreCourant?.scoreGlobal ?? null,
        meilleure: "max" as const,
        render: (p: Parcelle) => <ScoreBar score={p.scoreCourant?.scoreGlobal ?? null} />,
      }]
    : []),
  { label: "Région", valeur: () => null, render: (p) => p.parcelle.regionNom },
  { label: "Statut foncier", valeur: () => null, render: (p) => <BadgeStatut statut={p.parcelle.statutFoncier} /> },
  { label: "Accès à l'eau", valeur: () => null, render: (p) => (p.parcelle.accesEau ? ACCES_EAU_LABEL[p.parcelle.accesEau] : "—") },
  { label: "Topographie", valeur: () => null, render: (p) => p.parcelle.topographie ?? "—" },
];

// Ignore les lignes non comparables (max/min) ou pour lesquelles moins de 2
// parcelles ont une valeur connue (rien à distinguer).
function meilleureValeur(ligne: Ligne, parcelles: Parcelle[]): number | null {
  if (!ligne.meilleure) return null;
  const valeurs = parcelles.map(ligne.valeur).filter((v): v is number => v != null);
  if (valeurs.length < 2) return null;
  return ligne.meilleure === "max" ? Math.max(...valeurs) : Math.min(...valeurs);
}

export default function ComparateurScreen() {
  // useComparateur() lit sessionStorage dans un effet (absent au rendu
  // serveur, cf. son propre commentaire) : `parcelles` démarre à [] avant ce
  // premier effet, indiscernable ici d'un "vraiment vide" — l'état vide ci-
  // dessous s'affiche donc brièvement même quand une sélection existe, avant
  // de basculer sur le tableau dès que l'effet a tourné (un seul tick,
  // jamais perceptible).
  const { parcelles, retirer } = useComparateur();

  if (parcelles.length === 0) {
    return (
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px 20px 0" }}>
        {/* h1 constant que la page ait des parcelles ou non — auparavant
            "Comparateur" n'était annoncé qu'à l'état rempli (revue a11y,
            Phase 3). */}
        <h1 style={{ fontSize: "24px", fontWeight: 500, margin: 0 }}>Comparateur</h1>
        <EtatVide
          titre="Aucune parcelle à comparer"
          description="Sélectionnez 2 ou 3 parcelles depuis le catalogue, vos favoris ou une fiche annonce pour les comparer côte à côte. La sélection ne se transmet pas via un lien partagé — elle est à refaire dans ce cas."
          action={
            <Link href="/parcelles" className="btn-primary" style={{ textDecoration: "none" }}>
              Explorer le catalogue
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="akal-fade-in" style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px 20px 64px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 500, margin: "0 0 24px" }}>Comparateur</h1>

      {/* Carte — visualise la position relative des parcelles comparées
          (P1-01) : un même prix/ha peut recouvrir une parcelle repliée sur
          elle-même ou éclatée sur 3 régions différentes, invisible dans le
          tableau seul. */}
      <div
        style={{
          height: "320px",
          marginBottom: "28px",
          borderRadius: "var(--radius-card)",
          overflow: "hidden",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <CarteComparateur parcelles={parcelles} />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: `${280 + parcelles.length * 220}px` }}>
          <thead>
            <tr>
              <th style={{ width: "140px" }} />
              {parcelles.map((p) => {
                const image = p.photoPrincipale ?? p.photos[0] ?? null;
                return (
                  <th key={p.id} style={{ textAlign: "left", padding: "0 12px 16px", verticalAlign: "bottom" }}>
                    <div style={{ position: "relative" }}>
                      {/* Bouton retirer en dehors du <Link> (fiche annonce) —
                          jamais un bouton imbriqué dans un lien. */}
                      <button
                        type="button"
                        onClick={() => retirer(p.id)}
                        aria-label={`Retirer ${p.titre} de la comparaison`}
                        className="akal-focusable"
                        style={{
                          position: "absolute",
                          top: "6px",
                          right: "6px",
                          zIndex: 2,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "26px",
                          height: "26px",
                          borderRadius: "50%",
                          border: "none",
                          backgroundColor: "rgba(17,26,21,0.55)",
                          color: "white",
                          cursor: "pointer",
                        }}
                      >
                        <X size={13} />
                      </button>
                      <Link href={`/parcelles/${p.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                        <div
                          style={{
                            position: "relative",
                            width: "100%",
                            height: "120px",
                            borderRadius: "var(--radius-card)",
                            overflow: "hidden",
                            backgroundColor: "var(--color-menthe)",
                            marginBottom: "8px",
                          }}
                        >
                          {image && <Image src={image} alt={p.titre} fill sizes="220px" style={{ objectFit: "cover" }} />}
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-foret)", lineHeight: 1.3 }}>
                          {p.titre}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--color-tertiaire)", marginTop: "2px" }}>
                          <MapPin size={12} />
                          {p.parcelle.regionNom}
                        </div>
                      </Link>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {LIGNES.map((ligne) => {
              const meilleure = meilleureValeur(ligne, parcelles);
              return (
                <tr key={ligne.label} style={{ borderTop: "1px solid var(--color-bordure)" }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "var(--color-secondaire)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ligne.label}
                  </th>
                  {parcelles.map((p) => {
                    const estMeilleure = meilleure != null && ligne.valeur(p) === meilleure;
                    return (
                      <td
                        key={p.id}
                        style={{
                          padding: "12px",
                          fontSize: "14px",
                          fontWeight: estMeilleure ? 600 : 400,
                          color: estMeilleure ? "var(--color-foret)" : "var(--color-texte)",
                        }}
                      >
                        {ligne.render(p)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
