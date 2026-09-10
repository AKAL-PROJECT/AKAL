"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  MarqueurParcellePrix,
  boundsDeRegion,
  boundsNationalDe,
  EVENEMENT_RECADRAGE_CARTE,
  type RegionActive,
  type RegionRef,
} from "./CarteRegions";
import { TuileSatellite, BasculeFondCarte, type VueFond } from "./FondCarte";
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
    let t: ReturnType<typeof setTimeout> | undefined;
    const armer = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        if (!annule) reference.current = map.getBounds();
      }, 900);
    };
    Promise.resolve().then(() => {
      if (!annule) setVisible(false);
    });
    armer();

    // Réarme aussi à chaque recadrage programmatique déclenché par
    // VolVersRegion (pas seulement au montage/changement de `parcelles`) —
    // cf. EVENEMENT_RECADRAGE_CARTE (CarteRegions.tsx) : sans ce second
    // déclencheur, un recadrage survenant après ce délai initial de 900ms
    // (ex. regionBounds/boundsNational qui résolvent plus tard que le tout
    // premier cadrage, finalisation §1.1/§4) laisse la référence figée sur
    // l'ancienne vue et fait apparaître ce bouton à tort — la vue vient de
    // changer PAR LE CODE, pas par un geste de l'utilisateur.
    const surRecadrage = () => {
      // reference.current remis à null (pas seulement setVisible(false)) —
      // exactement l'état initial avant le tout premier armer() : le garde
      // `if (!reference.current) return;` du moveend plus bas ignore alors
      // sûrement le moveend de FIN d'animation de ce même recadrage (flyTo/
      // flyToBounds, ~0.8s) même s'il survient tout juste avant que le
      // nouveau timer de 900ms n'ait capturé la nouvelle référence — sans
      // ça, ce moveend comparait la vue tout juste recadrée à l'ANCIENNE
      // référence (encore en place jusqu'au tick du nouveau timer) et
      // déclenchait un faux positif.
      reference.current = null;
      setVisible(false);
      armer();
    };
    map.on(EVENEMENT_RECADRAGE_CARTE, surRecadrage);

    return () => {
      annule = true;
      if (t) clearTimeout(t);
      map.off(EVENEMENT_RECADRAGE_CARTE, surRecadrage);
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

// Reporte le centre courant de la carte au parent (moveend) — la carte plein
// écran (/carte) s'en sert pour trier le tiroir de résultats par proximité
// (design 1c). Rendu uniquement quand `onChange` est fourni : aucun coût sur
// les autres cartes.
function RapporteurCentre({ onChange }: { onChange?: (c: { lat: number; lng: number }) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!onChange) return;
    const maj = () => {
      const c = map.getCenter();
      onChange({ lat: c.lat, lng: c.lng });
    };
    maj();
    map.on("moveend", maj);
    return () => {
      map.off("moveend", maj);
    };
  }, [map, onChange]);
  return null;
}

// Vol vers la parcelle sélectionnée DEPUIS LE TIROIR (design 1c) — pas depuis
// un clic sur un repère, où recadrer serait désorientant. `cible` est un
// objet neuf à chaque sélection tiroir côté page (nonce implicite), l'effet
// se rejoue donc même si l'id ne change pas. Fire EVENEMENT_RECADRAGE_CARTE
// pour que BoutonRechercherZone ne prenne pas ce vol programmatique pour un
// geste utilisateur.
function VolVersParcelleActive({ cible }: { cible: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!cible) return;
    map.flyTo([cible.lat, cible.lng], Math.max(map.getZoom(), 12), { duration: 0.7 });
    map.fire(EVENEMENT_RECADRAGE_CARTE);
  }, [map, cible]);
  return null;
}

// Contrôle de zoom flottant (design 1c : colonne blanche, deux cases +/−) —
// remplace le zoomControl Leaflet natif, désactivé en mode sélection pour
// libérer le coin haut-gauche (barre flottante de la page). Posé sous la
// bascule de fond de carte (FondCarte.tsx, top:12 right:12).
function ZoomFlottant() {
  const map = useMap();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) L.DomEvent.disableClickPropagation(ref.current);
  }, []);
  const caseStyle: React.CSSProperties = {
    width: "34px",
    height: "34px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "white",
    color: "var(--color-nuit)",
    fontSize: "18px",
    lineHeight: 1,
    cursor: "pointer",
  };
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "60px",
        right: "12px",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        boxShadow: "var(--shadow-2)",
      }}
    >
      <button type="button" aria-label="Zoomer" onClick={() => map.zoomIn()} style={{ ...caseStyle, borderBottom: "1px solid var(--color-bordure)" }}>
        +
      </button>
      <button type="button" aria-label="Dézoomer" onClick={() => map.zoomOut()} style={caseStyle}>
        −
      </button>
    </div>
  );
}

export default function CarteLeaflet({
  parcelles,
  regions,
  regionActive,
  onSelectionnerRegion,
  onRechercherZone,
  zoneGeometrie,
  parcelleActiveId,
  onSelectionnerParcelle,
  onCentreCarte,
  volVersParcelle,
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
  // ── Mode « sélection » (carte plein écran /carte, design 1c) ────────────
  // Activé dès que `onSelectionnerParcelle` est fourni : les repères
  // deviennent des pastilles de prix cliquables (MarqueurParcellePrix) au
  // lieu de pins + popup, le zoom natif est remplacé par ZoomFlottant, et le
  // centre de la carte est reporté via `onCentreCarte`. Toutes ces props
  // sont omises par le catalogue / la couverture Home → comportement
  // strictement inchangé pour eux.
  parcelleActiveId?: string | null;
  onSelectionnerParcelle?: (id: string) => void;
  onCentreCarte?: (centre: { lat: number; lng: number }) => void;
  volVersParcelle?: { lat: number; lng: number } | null;
}) {
  const modeSelection = !!onSelectionnerParcelle;
  const limites = useLimitesRegions(regions);
  // Fond satellite par défaut sur cette carte (finalisation §1.3) — mêmes
  // TuileSatellite/BasculeFondCarte que la fiche annonce, cf. FondCarte.tsx.
  const [vue, setVue] = useState<VueFond>("satellite");
  // Bounds réelles région/Maroc, calculées depuis les mêmes collections déjà
  // chargées pour le rendu des contours (finalisation §1.1/§4) — aucune
  // requête supplémentaire, cf. CarteRegions.tsx.
  const regionBounds = useMemo(
    () => (regionActive ? boundsDeRegion(limites[regionActive.code]) : null),
    [limites, regionActive],
  );
  const boundsNational = useMemo(() => boundsNationalDe(limites), [limites]);

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
      // Mode sélection (/carte) : zoom natif désactivé, remplacé par
      // ZoomFlottant (design 1c) — libère le coin haut-gauche pour la barre
      // flottante de la page.
      zoomControl={!modeSelection}
      style={{ height: "100%", width: "100%", borderRadius: "var(--radius-card)" }}
    >
      {vue === "satellite" ? <TuileSatellite /> : <TuileOSM />}
      <BasculeFondCarte vue={vue} onChange={setVue} />
      {modeSelection && <ZoomFlottant />}
      {modeSelection && <RapporteurCentre onChange={onCentreCarte} />}
      {modeSelection && <VolVersParcelleActive cible={volVersParcelle ?? null} />}

      <RecalculTailleCarte />
      <VolVersRegion
        centre={regionActive?.centre ?? null}
        parcelles={parcelles}
        zoneGeometrie={zoneGeometrie}
        regionBounds={regionBounds}
        boundsNational={boundsNational}
      />
      <BoutonRechercherZone parcelles={parcelles} onRechercherZone={onRechercherZone} />

      {/* Les 12 limites régionales, toujours affichées (P0-03) — cliquer
          sur une région filtre le catalogue exactement comme le sélecteur
          de la barre latérale (même patchFiltres({ region }) côté appelant,
          cf. app/parcelles/page.tsx). */}
      <LimitesRegions
        limites={limites}
        codeActif={regionActive?.code ?? null}
        onSelectionner={onSelectionnerRegion}
        surSatellite={vue === "satellite"}
      />

      {/* Regroupement en bulles chiffrées dès que plusieurs parcelles sont
          proches (audit cartographie du 19/08) — même réglage que la
          mini-carte de couverture (CarteCouvertureLeaflet.tsx). `key` forcé
          au code de région : react-leaflet-cluster ne re-indexe pas ses
          clusters tout seul quand le jeu de marqueurs change de région,
          remonter le groupe entier est la façon documentée de le forcer. */}
      <MarkerClusterGroup
        key={regionActive?.code ?? "tout"}
        chunkedLoading
        maxClusterRadius={45}
        // Mode sélection : au-delà du zoom région les pastilles de prix se
        // séparent toutes (design 1c — repères individuels cliquables) ; en
        // deçà, le regroupement reste utile sur une zone dense.
        disableClusteringAtZoom={modeSelection ? 10 : undefined}
        spiderfyOnMaxZoom={modeSelection}
      >
        {/* latitude/longitude non-null par contrat (cf. types/parcelle.ts,
            décision d'équipe du 2026-08-15) — pas de filtre ici, la garde vit
            dans MarqueurParcelle lui-même (source unique, CarteRegions.tsx). */}
        {parcelles.map((p) =>
          modeSelection ? (
            <MarqueurParcellePrix
              key={p.id}
              parcelle={p}
              actif={p.id === parcelleActiveId}
              onSelect={onSelectionnerParcelle!}
            />
          ) : (
            <MarqueurParcelle key={p.id} parcelle={p} />
          ),
        )}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
