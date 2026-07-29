"use client";

import { useState } from "react";
import Link from "next/link";
import CardParcelle from "./CardParcelle";
import BarreComparateur from "./BarreComparateur";
import { MountainEmpty } from "@/components/icons/Icons";
import { useFavorisIds } from "@/hooks/useFavorisIds";
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
  const [comparaison, setComparaison] = useState<string[]>([]);

  const toggleComparaison = (id: string) => {
    setComparaison((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  async function retirerDesFavoris(id: string) {
    await toggleFavori(id);
    setParcelles((prev) => prev.filter((p) => p.id !== id));
    setComparaison((prev) => prev.filter((x) => x !== id));
  }

  const parcellesComparees = parcelles.filter((p) => comparaison.includes(p.id));

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 20px 80px" }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Mes favoris</h1>

      {parcelles.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            padding: "80px 20px",
            textAlign: "center",
            color: "var(--color-tertiaire)",
          }}
        >
          <MountainEmpty size={64} style={{ color: "var(--color-menthe)" }} />
          <p style={{ fontSize: "16px", fontWeight: 500, color: "var(--color-texte)", margin: 0 }}>
            Aucun favori pour l&apos;instant
          </p>
          <p style={{ fontSize: "14px", color: "var(--color-secondaire)", margin: 0, maxWidth: "320px" }}>
            Cliquez sur le cœur d&apos;une annonce pour la retrouver ici.
          </p>
          <Link href="/parcelles" className="btn-secondary" style={{ textDecoration: "none" }}>
            Explorer les parcelles
          </Link>
        </div>
      ) : (
        <div style={GRILLE_STYLE}>
          {parcelles.map((p, i) => (
            <CardParcelle
              key={p.id}
              parcelle={p}
              index={i}
              favori
              onToggleFavori={retirerDesFavoris}
              enComparaison={comparaison.includes(p.id)}
              onToggleComparaison={toggleComparaison}
            />
          ))}
        </div>
      )}

      <BarreComparateur parcelles={parcellesComparees} onRetirer={toggleComparaison} />
    </div>
  );
}
