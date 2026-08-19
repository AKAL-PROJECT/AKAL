"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import type { Parcelle } from "@/types/parcelle";
import type { BboxCarte } from "@/data/parcelles";
import TuileOSM from "@/components/TuileOSM";
import { LIMITES_MAROC } from "@/lib/leaflet";
import { Search } from "@/components/icons/Icons";
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
// Regroupement des marqueurs proches en bulles chiffrées (audit
// cartographie du 19/08) — jusque-là seule CarteCouvertureLeaflet.tsx
// (mini-carte de la Home) en bénéficiait ; cette carte-ci (catalogue +
// /carte plein écran) affichait chaque parcelle comme un pin séparé, une
// masse verte illisible dès qu'une même zone comptait plusieurs dizaines
// d'annonces (ex. Casablanca-Settat). Même bibliothèque, mêmes réglages.
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";

// Bouton flottant "Rechercher cette zone" (2026-08-17, à la Airbnb) —
// apparaît quand la vue de la carte diverge des parcelles actuellement
// affichées (l'utilisateur a déplacé/zoomé), pour relancer la recherche sur
// la zone visible plutôt que sur les filtres région/province/commune.
//
// La "zone de référence" se resynchronise sur la vue courante à chaque
// nouveau lot de résultats affiché (nouveau filtre, nouvelle page, ou clic
// sur ce bouton lui-même) — pas de distinction programmatique/utilisateur
// sur les événements moveend eux-mêmes : plus simple à raisonner, et c'est
// exactement ce qui compte ("la vue correspond-elle à ce qui est affiché ?"),
// pas qui a déplacé la carte. Le délai de 900ms avant de capturer la
// référence laisse le temps à un flyTo déclenché ailleurs (VolVersRegion,
// durée 0.8s) de terminer son animation.
function BoutonRechercherZone({
  parcelles,
  onRechercherZone,
}: {
  parcelles: Parcelle[];
  onRechercherZone?: (bbox: BboxCarte) => void;
}) {
  const map = useMap();
  const [visible, setVisible] = useState(false);
  const reference = useRef<ReturnType<typeof map.getBounds> | null>(null);
  const boutonRef = useRef<HTMLButtonElement>(null);

  // Ce bouton est un <button> HTML brut positionné à l'intérieur du
  // <MapContainer> — contrairement à un vrai contrôle Leaflet (L.Control),
  // rien n'empêche par défaut un clic/double-clic dessus de se propager
  // jusqu'au conteneur de la carte. doubleClickZoom n'est pas désactivé sur
  // cette carte (cf. <MapContainer> plus bas) : un double-clic/double-tap
  // rapide sur ce bouton (fréquent sur mobile) déclenchait donc AUSSI un
  // zoom Leaflet juste en dessous, en plus de l'action recherchée. Même
  // traitement que Leaflet applique lui-même à ses propres contrôles
  // (L.Control._container) — disableClickPropagation coupe aussi le
  // dblclick, disableScrollPropagation évite un zoom molette involontaire
  // en survolant le bouton.
  useEffect(() => {
    if (!boutonRef.current) return;
    L.DomEvent.disableClickPropagation(boutonRef.current);
    L.DomEvent.disableScrollPropagation(boutonRef.current);
  }, [visible]);

  useEffect(() => {
    // setVisible différé d'un micro-tick (Promise.resolve) plutôt qu'appelé
    // en tête d'effet — même convention que le chargement du catalogue
    // (app/parcelles/page.tsx) : un setState synchrone dans le corps d'un
    // effet déclenche un rendu en cascade avant même le démarrage du timer
    // ci-dessous (react-hooks/set-state-in-effect).
    let annule = false;
    Promise.resolve().then(() => {
      if (!annule) setVisible(false);
    });
    const t = setTimeout(() => {
      reference.current = map.getBounds();
    }, 900);
    return () => {
      annule = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelles]);

  useMapEvents({
    moveend() {
      if (!reference.current || !onRechercherZone) return;
      const actuel = map.getBounds();
      const ref = reference.current;
      // Tolérance en degrés (~1km) — évite un faux positif sur l'imprécision
      // de projection Leaflet (même remarque déjà faite pour getCenter()
      // dans VolVersRegion, CarteRegions.tsx).
      const TOLERANCE = 0.01;
      const diverge =
        Math.abs(actuel.getNorth() - ref.getNorth()) > TOLERANCE ||
        Math.abs(actuel.getSouth() - ref.getSouth()) > TOLERANCE ||
        Math.abs(actuel.getEast() - ref.getEast()) > TOLERANCE ||
        Math.abs(actuel.getWest() - ref.getWest()) > TOLERANCE;
      setVisible(diverge);
    },
  });

  if (!visible || !onRechercherZone) return null;

  return (
    <button
      ref={boutonRef}
      type="button"
      onClick={() => {
        const b = map.getBounds();
        setVisible(false);
        onRechercherZone({
          latMin: b.getSouth(),
          latMax: b.getNorth(),
          lngMin: b.getWest(),
          lngMax: b.getEast(),
        });
      }}
      className="akal-focusable akal-pop-in"
      style={{
        position: "absolute",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 18px",
        borderRadius: "var(--radius-full)",
        border: "none",
        backgroundColor: "var(--color-foret)",
        color: "white",
        fontSize: "14px",
        fontWeight: 600,
        boxShadow: "var(--shadow-2)",
        cursor: "pointer",
      }}
    >
      <Search size={15} /> Rechercher cette zone
    </button>
  );
}

export default function CarteLeaflet({
  parcelles,
  regions,
  regionActive,
  onSelectionnerRegion,
  onRechercherZone,
  zoneGeometrie,
}: {
  parcelles: Parcelle[];
  // Les 12 régions officielles (référentiel PostGIS, jamais de tracé
  // statique côté front — audit P0-02/P0-03) : mêmes limites que la carte
  // de couverture de la Home, cf. CarteRegions.tsx.
  regions: RegionRef[];
  regionActive: RegionActive;
  onSelectionnerRegion?: (code: string) => void;
  // "Rechercher cette zone" (2026-08-17) — omis (undefined) sur les cartes
  // qui n'ont pas de sens à héberger cette recherche par zone (ex. future
  // réutilisation hors du catalogue) : le bouton ne se rend simplement pas.
  onRechercherZone?: (bbox: BboxCarte) => void;
  // Géométrie de la province/commune sélectionnée dans les filtres (cascade
  // zoom du 19/08) — cf. VolVersRegion (CarteRegions.tsx) pour la priorité
  // de cadrage exacte. Omis (undefined) sur les cartes sans cette cascade
  // de filtres (ex. couverture Home, région seule).
  zoneGeometrie?: unknown | null;
}) {
  const limites = useLimitesRegions(regions);

  return (
    <MapContainer
      bounds={LIMITES_MAROC}
      boundsOptions={{ padding: [24, 24] }}
      scrollWheelZoom
      // Empêche de dézoomer jusqu'à l'Europe/l'Afrique subsaharienne au
      // scroll (audit cartographie du 19/08) — 5 correspond au zoom qui
      // fait déjà tenir tout le Maroc à l'écran (cf. LIMITES_MAROC), donc
      // aucune perte : impossible de dézoomer plus loin que "voir tout le
      // pays" de toute façon utile ici.
      minZoom={5}
      style={{ height: "100%", width: "100%", borderRadius: "var(--radius-card)" }}
    >
      <TuileOSM />

      <RecalculTailleCarte />
      <VolVersRegion centre={regionActive?.centre ?? null} parcelles={parcelles} zoneGeometrie={zoneGeometrie} />
      <BoutonRechercherZone parcelles={parcelles} onRechercherZone={onRechercherZone} />

      {/* Les 12 limites régionales, toujours affichées (P0-03) — cliquer
          sur une région filtre le catalogue exactement comme le sélecteur
          de la barre latérale (même patchFiltres({ region }) côté appelant,
          cf. app/parcelles/page.tsx). */}
      <LimitesRegions limites={limites} codeActif={regionActive?.code ?? null} onSelectionner={onSelectionnerRegion} />

      {/* Regroupement en bulles chiffrées dès que plusieurs parcelles sont
          proches (audit cartographie du 19/08) — même réglage que la
          mini-carte de couverture (CarteCouvertureLeaflet.tsx). `key` forcé
          au code de région : react-leaflet-cluster ne re-indexe pas ses
          clusters tout seul quand le jeu de marqueurs change de région,
          remonter le groupe entier est la façon documentée de le forcer. */}
      <MarkerClusterGroup key={regionActive?.code ?? "tout"} chunkedLoading maxClusterRadius={45}>
        {/* latitude/longitude non-null par contrat (cf. types/parcelle.ts,
            décision d'équipe du 2026-08-15) — pas de filtre ici, la garde vit
            dans MarqueurParcelle lui-même (source unique, CarteRegions.tsx). */}
        {parcelles.map((p) => (
          <MarqueurParcelle key={p.id} parcelle={p} />
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
