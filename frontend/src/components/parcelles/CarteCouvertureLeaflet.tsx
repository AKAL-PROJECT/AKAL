"use client";

import { useMemo } from "react";
import { MapContainer } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
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
        {/* AUDIT — conflit de merge. La branche vendeur-auth-contact
            réimplémentait ici tout le JSX du marqueur/popup en inline
            (avec un filtre latitude/longitude != null en amont, cohérent
            avec son typage nullable de ParcelleTerrain) au lieu de
            réutiliser <MarqueurParcelle>, le composant partagé extrait de
            ce même fichier pendant P1-01 précisément pour être réutilisé
            (cf. CarteRegions.tsx) — vraisemblablement écrit en parallèle,
            avant/sans connaître cette extraction : son JSX inline
            référençait Marker/Popup/Link/formatMAD/iconeAkal sans les
            importer dans ce fichier, donc n'aurait de toute façon pas
            compilé tel quel. Résolution : on garde le composant partagé
            (pas de duplication) et on adopte son filtre défensif — devenu
            nécessaire de toute façon puisque latitude/longitude sont
            maintenant `number | null` (cf. types/parcelle.ts). Mais
            MarqueurParcelle lui-même (CarteRegions.tsx:196) fait encore
            `position={[p.parcelle.latitude, p.parcelle.longitude]}` sans
            garde — passe-t-il tsc une fois ce filtre appliqué en amont ici
            mais pas dans SES AUTRES appelants (CarteComparateur,
            CarteLeafletFiche…) ? Non vérifié — cf. rapport d'audit. */}
        {visibles
          .filter((p) => p.parcelle.latitude != null && p.parcelle.longitude != null)
          .map((p) => (
            <MarqueurParcelle key={p.id} parcelle={p} />
          ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
