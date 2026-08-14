"use client";

import { useState } from "react";
import Link from "next/link";
import CardParcelle from "./CardParcelle";
import BarreComparateur from "./BarreComparateur";
import { EtatVide } from "@/components/EtatVide";
import { useFavorisIds } from "@/hooks/useFavorisIds";
import { useComparateur } from "@/hooks/useComparateur";
import type { Parcelle } from "@/types/parcelle";

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
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Mes favoris</h1>

      {parcelles.length === 0 ? (
        <EtatVide
          titre="Aucun favori pour l'instant"
          description="Cliquez sur le cœur d'une annonce pour la retrouver ici."
          action={
            <Link href="/parcelles" className="btn-secondary" style={{ textDecoration: "none" }}>
              Explorer les parcelles
            </Link>
          }
        />
      ) : (
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
      )}

      <BarreComparateur parcelles={parcellesComparees} onRetirer={retirerComparaison} />
    </div>
  );
}
