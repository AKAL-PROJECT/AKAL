"use client";

import { MapContainer } from "react-leaflet";
import type { Parcelle } from "@/types/parcelle";
import TuileOSM from "@/components/TuileOSM";
import { CENTRE_MAROC } from "@/lib/leaflet";
import {
  useLimitesRegions,
  LimitesRegions,
  VolVersRegion,
  RecalculTailleCarte,
  MarqueurParcelle,
  type RegionActive,
  type RegionRef,
} from "./CarteRegions";
import "leaflet/dist/leaflet.css";

export default function CarteLeaflet({
  parcelles,
  regions,
  regionActive,
  onSelectionnerRegion,
}: {
  parcelles: Parcelle[];
  // Les 12 régions officielles (référentiel PostGIS, jamais de tracé
  // statique côté front — audit P0-02/P0-03) : mêmes limites que la carte
  // de couverture de la Home, cf. CarteRegions.tsx.
  regions: RegionRef[];
  regionActive: RegionActive;
  onSelectionnerRegion?: (code: string) => void;
}) {
  const limites = useLimitesRegions(regions);

  return (
    <MapContainer
      center={CENTRE_MAROC}
      zoom={6}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", borderRadius: "var(--radius-card)" }}
    >
      <TuileOSM />

      <RecalculTailleCarte />
      <VolVersRegion centre={regionActive?.centre ?? null} />

      {/* Les 12 limites régionales, toujours affichées (P0-03) — cliquer
          sur une région filtre le catalogue exactement comme le sélecteur
          de la barre latérale (même patchFiltres({ region }) côté appelant,
          cf. app/parcelles/page.tsx). */}
      <LimitesRegions limites={limites} codeActif={regionActive?.code ?? null} onSelectionner={onSelectionnerRegion} />

      {parcelles.map((p) => (
        <MarqueurParcelle key={p.id} parcelle={p} />
      ))}
    </MapContainer>
  );
}
