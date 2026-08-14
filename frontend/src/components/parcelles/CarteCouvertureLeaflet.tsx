"use client";

import { useMemo } from "react";
import { MapContainer, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import Link from "next/link";
import type { Parcelle } from "@/types/parcelle";
import TuileOSM from "@/components/TuileOSM";
import { iconeAkal, CENTRE_MAROC } from "@/lib/leaflet";
import { formatMAD } from "@/lib/format";
import { useLimitesRegions, LimitesRegions, VolVersRegion, RecalculTailleCarte, type RegionActive, type RegionRef } from "./CarteRegions";
// Sans ce CSS, les tuiles Leaflet (.leaflet-tile) restent en flux normal
// (pas de position:absolute) : elles s'empilent verticalement l'une sous
// l'autre au lieu de se superposer, chacune en plus décalée par le
// translate3d de sa voisine précédente — la carte affiche alors quelques
// fragments de tuiles disséminés en diagonale sur un fond vide. Les autres
// cartes du projet importent chacune leur propre copie (CarteLeaflet.tsx,
// CarteLeafletFiche.tsx, CarteLeafletPicker.tsx) ; celle-ci utilisait déjà
// react-leaflet-cluster sans jamais l'avoir importé.
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";

export type { RegionActive };

export default function CarteCouvertureLeaflet({
  parcelles,
  regions,
  regionActive,
  onSelectionnerRegion,
}: {
  parcelles: Parcelle[];
  // Les 12 régions officielles (jamais une liste recopiée à la main —
  // audit P0-03) — chargées par l'appelant (CouvertureSection.tsx) depuis
  // /api/geo/regions/, transmises ici pour dériver les 12 limites.
  regions: RegionRef[];
  regionActive: RegionActive;
  // Optionnel : clic direct sur une région de la carte, en plus du panneau
  // de gauche (CouvertureSection.tsx) — même sélection, deux points d'entrée.
  onSelectionnerRegion?: (code: string) => void;
}) {
  const limites = useLimitesRegions(regions);
  const visibles = useMemo(
    () => (regionActive ? parcelles.filter((p) => p.parcelle.regionNom === regionActive.nom) : parcelles),
    [parcelles, regionActive]
  );

  return (
    <MapContainer center={CENTRE_MAROC} zoom={6} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
      <TuileOSM />

      <RecalculTailleCarte />
      <VolVersRegion centre={regionActive?.centre ?? null} />

      {/* Les 12 limites régionales (union des provinces, référentiel
          géométrique officiel) — toujours affichées, même sans annonce
          (P0-03) ; celle active se distingue par un contour plus marqué. */}
      <LimitesRegions limites={limites} codeActif={regionActive?.code ?? null} onSelectionner={onSelectionnerRegion} />

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
