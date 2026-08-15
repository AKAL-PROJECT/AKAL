"use client";

import { useEffect } from "react";
import { MapContainer, useMap } from "react-leaflet";
import type { Parcelle } from "@/types/parcelle";
import TuileOSM from "@/components/TuileOSM";
import { CENTRE_MAROC } from "@/lib/leaflet";
import { MarqueurParcelle } from "./CarteRegions";
import "leaflet/dist/leaflet.css";

// Cadre la carte sur l'ensemble des parcelles comparées, jamais un zoom
// fixe : deux parcelles comparées peuvent être à quelques centaines de
// mètres l'une de l'autre comme à l'autre bout du pays. Pas de gestion de
// resize (RecalculTailleCarte, cf. CarteRegions.tsx) ici : ce conteneur a
// une hauteur fixe (ComparateurScreen.tsx), pas de panneau voisin dont la
// taille varie après le montage — le cas qui motivait ce composant côté
// carte catalogue/couverture ne s'applique pas ici.
function AjusterAuxParcelles({ parcelles }: { parcelles: Parcelle[] }) {
  const map = useMap();

  useEffect(() => {
    if (parcelles.length === 0) return;
    if (parcelles.length === 1) {
      map.setView([parcelles[0].parcelle.latitude, parcelles[0].parcelle.longitude], 13);
      return;
    }
    const points = parcelles.map((p) => [p.parcelle.latitude, p.parcelle.longitude] as [number, number]);
    map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
    // `parcelles` recréé à chaque rendu du parent (nouveau tableau à chaque
    // ajout/retrait, cf. useComparateur) — comparaison sur les id seuls pour
    // ne pas recadrer sans raison à un rendu sans changement réel (même
    // convention que useLimitesRegions, CarteRegions.tsx).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelles.map((p) => p.id).join(","), map]);

  return null;
}

export default function CarteComparateur({ parcelles }: { parcelles: Parcelle[] }) {
  return (
    <MapContainer
      center={CENTRE_MAROC}
      zoom={6}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%", borderRadius: "var(--radius-card)" }}
    >
      <TuileOSM />
      <AjusterAuxParcelles parcelles={parcelles} />
      {parcelles.map((p) => (
        <MarqueurParcelle key={p.id} parcelle={p} />
      ))}
    </MapContainer>
  );
}
