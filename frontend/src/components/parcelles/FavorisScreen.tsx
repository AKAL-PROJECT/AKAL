"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import CardParcelle from "./CardParcelle";
import BarreComparateur from "./BarreComparateur";
import { RapportProspection } from "./RapportProspection";
import { EtatVide } from "@/components/EtatVide";
import { useFavorisIds } from "@/hooks/useFavorisIds";
import { useComparateur } from "@/hooks/useComparateur";
import { FileText } from "@/components/icons/Icons";
import type { Parcelle } from "@/types/parcelle";

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

const GRILLE_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
  gap: "16px",
};

export function FavorisScreen({ parcellesInitiales }: { parcellesInitiales: Parcelle[] }) {
  // Toute parcelle affichée ici est par définition déjà favorite (favori={true}
  // fixe plus bas) — pas besoin de recouper avec useFavorisIds().favorisIds
  // (qui démarre vide avant son propre chargement asynchrone : le faire
  // aurait provoqué un flash "aucun favori" avant que ce chargement finisse).
  // On retire simplement de la liste locale au clic, après confirmation serveur.
  const [parcelles, setParcelles] = useState(parcellesInitiales);
  const { toggleFavori } = useFavorisIds();
  // Même liste de comparaison que le catalogue et la fiche annonce (P1-01) —
  // persistée en sessionStorage par le hook, pas un état local à cet écran.
  const { parcelles: parcellesComparees, basculer: basculerComparaison, estEnComparaison, retirer: retirerComparaison } = useComparateur();

  const toggleComparaison = (id: string) => {
    const p = parcelles.find((x) => x.id === id);
    if (p) basculerComparaison(p);
  };

  async function retirerDesFavoris(id: string) {
    await toggleFavori(id);
    setParcelles((prev) => prev.filter((p) => p.id !== id));
    // Un favori retiré n'a plus de raison de rester dans la comparaison —
    // no-op si elle n'y était pas (retirer() est déjà idempotent).
    retirerComparaison(id);
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 20px 80px" }}>
      {/* akal-print-masquer : tout l'écran normal disparaît à l'impression,
          remplacé par RapportProspection (toujours dans le DOM, invisible à
          l'écran) — cf. globals.css et le commentaire de ce composant. */}
      <div className="akal-print-masquer">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: 24, margin: 0 }}>Tableau de bord</h1>
            <p style={{ fontSize: 14, color: "var(--color-secondaire)", margin: "6px 0 0" }}>
              Vos parcelles sélectionnées — comparez-les ou exportez votre prospection en PDF.
            </p>
          </div>
          {parcelles.length > 0 && (
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-secondary akal-focusable"
              style={{ display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" }}
            >
              <FileText size={15} />
              Télécharger le rapport PDF
            </button>
          )}
        </div>

        {parcelles.length === 0 ? (
          <div style={{ marginTop: 24 }}>
            <EtatVide
              titre="Aucun favori pour l'instant"
              description="Cliquez sur le cœur d'une annonce pour la retrouver ici."
              action={
                <Link href="/parcelles" className="btn-secondary" style={{ textDecoration: "none" }}>
                  Explorer les parcelles
                </Link>
              }
            />
          </div>
        ) : (
          <>
            {/* Carte — vue d'ensemble géographique de la sélection (P1-03
                prolonge P1-01 : même logique de cadrage automatique,
                cf. CarteComparateur.tsx). Pas de plafond ici contrairement au
                comparateur : toute la sélection, pas seulement les 3 en
                comparaison active. */}
            <div
              style={{
                height: "280px",
                margin: "24px 0",
                borderRadius: "var(--radius-card)",
                overflow: "hidden",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <CarteComparateur parcelles={parcelles} />
            </div>

            <div style={GRILLE_STYLE}>
              {parcelles.map((p, i) => (
                <CardParcelle
                  key={p.id}
                  parcelle={p}
                  index={i}
                  favori
                  onToggleFavori={retirerDesFavoris}
                  enComparaison={estEnComparaison(p.id)}
                  onToggleComparaison={toggleComparaison}
                />
              ))}
            </div>
          </>
        )}

        <BarreComparateur parcelles={parcellesComparees} onRetirer={retirerComparaison} />
      </div>

      <RapportProspection parcelles={parcelles} />
    </div>
  );
}
