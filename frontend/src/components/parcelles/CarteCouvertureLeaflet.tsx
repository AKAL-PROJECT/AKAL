"use client";

import { useMemo, useState } from "react";
import { MapContainer } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { Parcelle } from "@/types/parcelle";
import TuileOSM from "@/components/TuileOSM";
import { LIMITES_MAROC } from "@/lib/leaflet";
import {
  useLimitesRegions,
  LimitesRegions,
  VolVersRegion,
  RecalculTailleCarte,
  MarqueurParcelle,
  boundsDeRegion,
  boundsNationalDe,
  type RegionActive,
  type RegionRef,
} from "./CarteRegions";
import { TuileSatellite, BasculeFondCarte, type VueFond } from "./FondCarte";
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
  regionSurvolee,
}: {
  // Déjà le bon jeu de parcelles à afficher — l'échantillon générique quand
  // aucune région n'est sélectionnée, sinon les vraies parcelles de la
  // région active (jusqu'à 50, cf. CouvertureSection.tsx) : plus de
  // filtrage par nom de région ici (retiré le 18/08 — filtrer l'échantillon
  // générique par région ne montrait quasiment jamais toutes les annonces
  // réelles d'une région donnée, contrairement au compteur affiché à côté,
  // lui déjà correct).
  parcelles: Parcelle[];
  // Les 12 régions officielles (jamais une liste recopiée à la main —
  // audit P0-03) — chargées par l'appelant (CouvertureSection.tsx) depuis
  // /api/geo/regions/, transmises ici pour dériver les 12 limites.
  regions: RegionRef[];
  regionActive: RegionActive;
  // Optionnel : clic direct sur une région de la carte, en plus du panneau
  // de gauche (CouvertureSection.tsx) — même sélection, deux points d'entrée.
  onSelectionnerRegion?: (code: string) => void;
  // Code de la région survolée dans le panneau de gauche (audit desktop du
  // 19/08) — surligne le polygone correspondant sur la carte pendant le
  // survol, cf. LimitesRegions (CarteRegions.tsx) pour le détail visuel.
  regionSurvolee?: string | null;
}) {
  const limites = useLimitesRegions(regions);
  // Fond satellite par défaut sur cette carte aussi (finalisation §1.3) —
  // même composant partagé que CarteLeaflet.tsx/CarteLeafletFiche.tsx.
  const [vue, setVue] = useState<VueFond>("satellite");
  const regionBounds = useMemo(
    () => (regionActive ? boundsDeRegion(limites[regionActive.code]) : null),
    [limites, regionActive],
  );
  const boundsNational = useMemo(() => boundsNationalDe(limites), [limites]);

  return (
    <MapContainer
      bounds={LIMITES_MAROC}
      boundsOptions={{ padding: [16, 16] }}
      scrollWheelZoom={false}
      // Cf. le même réglage sur CarteLeaflet.tsx (audit cartographie du
      // 19/08) — filet de sécurité, scrollWheelZoom étant déjà désactivé
      // ici le dézoom ne peut de toute façon venir que des boutons +/-.
      minZoom={5}
      style={{ height: "100%", width: "100%" }}
    >
      {vue === "satellite" ? <TuileSatellite /> : <TuileOSM />}
      <BasculeFondCarte vue={vue} onChange={setVue} />

      <RecalculTailleCarte />
      <VolVersRegion
        centre={regionActive?.centre ?? null}
        parcelles={parcelles}
        regionBounds={regionBounds}
        boundsNational={boundsNational}
      />

      {/* Les 12 limites régionales (union des provinces, référentiel
          géométrique officiel) — toujours affichées, même sans annonce
          (P0-03) ; celle active se distingue par un contour plus marqué. */}
      <LimitesRegions
        limites={limites}
        codeActif={regionActive?.code ?? null}
        codeSurvole={regionSurvolee}
        onSelectionner={onSelectionnerRegion}
        surSatellite={vue === "satellite"}
      />

      <MarkerClusterGroup key={regionActive?.code ?? "tout"} chunkedLoading maxClusterRadius={45}>
        {/* latitude/longitude non-null par contrat (cf. types/parcelle.ts,
            décision d'équipe du 2026-08-15) — pas de filtre ici, la garde
            vit dans MarqueurParcelle lui-même (source unique, CarteRegions.tsx). */}
        {parcelles.map((p) => (
          <MarqueurParcelle key={p.id} parcelle={p} />
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
