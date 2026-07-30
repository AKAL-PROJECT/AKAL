"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { AccesEau, Parcelle } from "@/types/parcelle";
import BadgeStatut from "./BadgeStatut";
import ScoreBar from "./ScoreBar";
import { MapPin, MountainEmpty } from "@/components/icons/Icons";
import { lireParcellesComparees } from "./comparateurStorage";

const formatMAD = new Intl.NumberFormat("fr-MA");

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
  {
    label: "AgriScore",
    valeur: (p) => p.scoreCourant?.scoreGlobal ?? null,
    meilleure: "max",
    render: (p) => <ScoreBar score={p.scoreCourant?.scoreGlobal ?? null} />,
  },
  { label: "Région", valeur: () => null, render: (p) => p.parcelle.regionNom },
  { label: "Statut foncier", valeur: () => null, render: (p) => <BadgeStatut statut={p.parcelle.statutFoncier} /> },
  { label: "Accès à l'eau", valeur: () => null, render: (p) => ACCES_EAU_LABEL[p.parcelle.accesEau] },
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
  // null = pas encore lu. Volontairement dans un effet plutôt que lu
  // directement au rendu (ou via un initialiseur paresseux useState) : le
  // rendu serveur n'a pas de sessionStorage, donc lire la valeur réelle dès
  // le premier rendu client créerait une désync serveur/client (hydration
  // mismatch). Exception délibérée à react-hooks/set-state-in-effect —
  // cf. https://react.dev/reference/react/useEffect#displaying-different-content-on-the-server-and-the-client.
  const [parcelles, setParcelles] = useState<Parcelle[] | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setParcelles(lireParcellesComparees());
  }, []);

  if (parcelles === null) return null;

  if (parcelles.length === 0) {
    return (
      <div className="akal-fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "120px 20px", gap: "20px", textAlign: "center" }}>
        <span style={{ color: "var(--color-foret)" }}>
          <MountainEmpty size={64} />
        </span>
        <h1 style={{ fontSize: "24px", fontWeight: 500, margin: 0 }}>Aucune parcelle à comparer</h1>
        <p style={{ fontSize: "15px", color: "var(--color-secondaire)", maxWidth: "440px", lineHeight: 1.6, margin: 0 }}>
          Sélectionnez 2 ou 3 parcelles depuis le catalogue pour les comparer côte à côte. La sélection
          ne se transmet pas via un lien partagé — reviens au catalogue pour la refaire.
        </p>
        <Link href="/parcelles" className="btn-primary" style={{ textDecoration: "none", marginTop: "8px" }}>
          Explorer le catalogue
        </Link>
      </div>
    );
  }

  return (
    <div className="akal-fade-in" style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px 20px 64px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 500, margin: "0 0 24px" }}>Comparateur</h1>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: `${280 + parcelles.length * 220}px` }}>
          <thead>
            <tr>
              <th style={{ width: "140px" }} />
              {parcelles.map((p) => {
                const image = p.photoPrincipale ?? p.photos[0] ?? null;
                return (
                  <th key={p.id} style={{ textAlign: "left", padding: "0 12px 16px", verticalAlign: "bottom" }}>
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
