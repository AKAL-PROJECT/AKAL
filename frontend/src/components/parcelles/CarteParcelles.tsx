"use client";

import dynamic from "next/dynamic";
import type { Parcelle } from "@/types/parcelle";
import type { RegionActive, RegionRef } from "./CarteRegions";

// Leaflet a besoin de `window`, qui n'existe pas au rendu serveur (SSR).
// On charge donc la carte uniquement côté client avec ssr: false.
const CarteLeaflet = dynamic(() => import("./CarteLeaflet"), {
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

export default function CarteParcelles({
  parcelles,
  regions,
  regionActive,
  onSelectionnerRegion,
  zoneGeometrie,
}: {
  parcelles: Parcelle[];
  regions: RegionRef[];
  regionActive: RegionActive;
  onSelectionnerRegion?: (code: string) => void;
  // Géométrie de la province/commune sélectionnée dans les filtres (cascade
  // zoom du 19/08) — cf. VolVersRegion (CarteRegions.tsx).
  zoneGeometrie?: unknown | null;
}) {
  return (
    <div
      style={{
        height: "500px",
        width: "100%",
        border: "1px solid var(--color-bordure)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <CarteLeaflet
        parcelles={parcelles}
        regions={regions}
        regionActive={regionActive}
        onSelectionnerRegion={onSelectionnerRegion}
        zoneGeometrie={zoneGeometrie}
      />
    </div>
  );
}
