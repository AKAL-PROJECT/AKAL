"use client";

import { MapContainer, Marker, Popup } from "react-leaflet";
import Link from "next/link";
import type { Parcelle } from "@/types/parcelle";
import TuileOSM from "@/components/TuileOSM";
import { iconeAkal, CENTRE_MAROC } from "@/lib/leaflet";
import { formatMAD } from "@/lib/format";
import { useLimitesRegions, LimitesRegions, VolVersRegion, RecalculTailleCarte, type RegionActive, type RegionRef } from "./CarteRegions";
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
        <Marker
          key={p.id}
          position={[p.parcelle.latitude, p.parcelle.longitude]}
          icon={iconeAkal}
        >
          <Popup>
            <div style={{ minWidth: "160px" }}>
              <strong style={{ fontSize: "13px", color: "#2D6A4F" }}>{p.titre}</strong>
              <div style={{ fontSize: "12px", color: "#555", margin: "4px 0" }}>
                {p.parcelle.regionNom} · {p.parcelle.surface} ha
              </div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#2D6A4F" }}>
                {formatMAD.format(p.prix)} MAD
              </div>
              <Link href={`/parcelles/${p.slug}`} style={{ fontSize: "12px", color: "#C4622D", textDecoration: "underline" }}>
                Voir l&apos;annonce →
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
