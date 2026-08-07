"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, Circle, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import Link from "next/link";
import type { Parcelle } from "@/types/parcelle";
import TuileOSM from "@/components/TuileOSM";
import { iconeAkal, CENTRE_MAROC } from "@/lib/leaflet";
import { formatMAD } from "@/lib/format";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

// Région active côté carte : centre dérivé de la moyenne des parcelles
// réelles de la région (jamais un tracé inventé) — cf. statsParRegion dans
// app/page.tsx. `centre` peut être null si la région n'a aucune parcelle.
export type RegionActive = { code: string; nom: string; centre: [number, number] | null } | null;

function VolVersRegion({ centre }: { centre: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (centre) map.flyTo(centre, 8, { duration: 0.8 });
    else map.flyTo(CENTRE_MAROC, 6, { duration: 0.8 });
  }, [centre, map]);
  return null;
}

export default function CarteCouvertureLeaflet({
  parcelles,
  regionActive,
}: {
  parcelles: Parcelle[];
  regionActive: RegionActive;
}) {
  const visibles = useMemo(
    () => (regionActive ? parcelles.filter((p) => p.parcelle.regionNom === regionActive.nom) : parcelles),
    [parcelles, regionActive]
  );

  return (
    <MapContainer center={CENTRE_MAROC} zoom={6} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
      <TuileOSM />

      <VolVersRegion centre={regionActive?.centre ?? null} />

      {/* Repère de la région sélectionnée — reprend l'idée de "spotlight" de
          MoroccoMap (composant remplacé par cette carte sur la Home), mais
          sans tracé de région inventé : un simple halo autour du centre réel. */}
      {regionActive?.centre && (
        <Circle
          center={regionActive.centre}
          radius={55000}
          pathOptions={{ color: "#2D6A4F", weight: 1.5, fillColor: "#52B788", fillOpacity: 0.08 }}
        />
      )}

      <MarkerClusterGroup key={regionActive?.code ?? "tout"} chunkedLoading maxClusterRadius={45}>
        {visibles.map((p) => (
          <Marker key={p.id} position={[p.parcelle.latitude, p.parcelle.longitude]} icon={iconeAkal}>
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
      </MarkerClusterGroup>
    </MapContainer>
  );
}
