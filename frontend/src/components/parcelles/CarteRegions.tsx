"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, Marker, Popup, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import Link from "next/link";
import type * as GJ from "geojson";
import { apiFetch } from "@/lib/api";
import { LIMITES_MAROC, iconeAkal } from "@/lib/leaflet";
import { formatMAD } from "@/lib/format";
import type { Parcelle } from "@/types/parcelle";

// Région active côté carte : centre dérivé de la moyenne des parcelles
// réelles de la région (jamais un tracé inventé) — cf. statsParRegion dans
// components/home/CouvertureSection.tsx. `centre` peut être null si la
// région n'a aucune parcelle.
export type RegionActive = { code: string; nom: string; centre: [number, number] | null } | null;

export type RegionRef = { code: string; nom: string };

// GeoJSON minimal utile ici — FeatureCollection de provinces (contrat API
// /api/geo/limites/provinces/?region=<slug>, cf. geo/serializers.py).
type FeatureCollectionProvinces = {
  type: "FeatureCollection";
  features: { type: "Feature"; geometry: GJ.Geometry; properties: Record<string, unknown> }[];
};

// Les 12 régions officielles avec leur limite réelle (union des provinces
// qui les composent, référentiel géométrique officiel PostGIS) — jamais de
// tracé approximatif/codé en dur côté front (audit P0-03, remplace la
// liste de 5 régions autrefois recopiée à la main dans CouvertureSection).
// Un appel par région (l'API n'expose pas de bulk /limites/regions/ avec
// géométrie), en parallèle au montage — 12 requêtes légères, mises en
// cache pour la durée de vie du composant plutôt que refaites à chaque
// sélection.
export function useLimitesRegions(regions: RegionRef[]) {
  const [limites, setLimites] = useState<Record<string, FeatureCollectionProvinces>>({});

  useEffect(() => {
    if (regions.length === 0) return;
    let annule = false;
    Promise.all(
      regions.map((r) =>
        apiFetch<FeatureCollectionProvinces>("/geo/limites/provinces/", { params: { region: r.code } })
          .then((d) => [r.code, d] as const)
          .catch(() => [r.code, null] as const),
      ),
    ).then((paires) => {
      if (annule) return;
      const suivant: Record<string, FeatureCollectionProvinces> = {};
      for (const [code, d] of paires) if (d) suivant[code] = d;
      setLimites(suivant);
    });
    return () => {
      annule = true;
    };
    // `regions` vient de l'API à chaque page, jamais recréé identique par
    // référence — comparaison sur les codes seuls pour ne pas re-fetcher
    // les 12 régions à chaque render du parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions.map((r) => r.code).join(",")]);

  return limites;
}

// Les 12 limites régionales, en permanence affichées (même sans annonce,
// cf. P0-03) — pas seulement celle sélectionnée. La région active se
// distingue par un contour plus marqué ; cliquer sur une région (active ou
// non) la sélectionne/désélectionne via `onSelectionner`. `codeSurvole`
// (optionnel, audit desktop du 19/08) : survol du panneau de gauche sur
// CouvertureSection.tsx — un palier visuel intermédiaire entre "au repos"
// et "actif", jamais aussi marqué qu'une vraie sélection (sinon survoler
// une région efface visuellement la sélection réelle le temps du survol).
export function LimitesRegions({
  limites,
  codeActif,
  codeSurvole,
  onSelectionner,
}: {
  limites: Record<string, FeatureCollectionProvinces>;
  codeActif: string | null;
  codeSurvole?: string | null;
  onSelectionner?: (code: string) => void;
}) {
  return (
    <>
      {Object.entries(limites).map(([code, donnees]) => {
        const active = code === codeActif;
        const survolee = !active && code === codeSurvole;
        return (
          <GeoJSON
            key={code}
            data={donnees as GJ.FeatureCollection}
            style={{
              color: "#2D6A4F",
              weight: active ? 2.5 : survolee ? 2 : 1,
              fillColor: "#52B788",
              fillOpacity: active ? 0.18 : survolee ? 0.13 : 0.06,
            }}
            eventHandlers={onSelectionner ? { click: () => onSelectionner(code) } : undefined}
          />
        );
      })}
    </>
  );
}

// Leaflet fige la taille de son conteneur au montage — si celui-ci change
// de taille ensuite (ex. panneau des 12 régions plus grand que les 5
// codées en dur avant, cf. audit P0-03/P0-02), la carte reste rendue à
// l'ancienne taille (tuiles tronquées dans un coin). ResizeObserver plutôt
// qu'un seul appel au montage : la taille du conteneur peut encore changer
// après (police qui finit de charger, contenu du panneau régions qui
// varie avec les compteurs réels).
export function RecalculTailleCarte() {
  const map = useMap();
  useEffect(() => {
    const conteneur = map.getContainer();
    const recalculer = () => {
      // invalidateSize() appelle en interne _resetView(getCenter(), getZoom())
      // — pendant un flyTo (cf. VolVersRegion) getZoom() renvoie le zoom
      // flottant interpolé à cet instant précis (ex. 5.999999995447035), et
      // _resetView() FIGE cette valeur non entière comme zoom permanent de
      // la carte (en plus d'interrompre l'animation en cours). Ce zoom
      // fractionnaire se retrouve ensuite tel quel dans l'URL des tuiles OSM
      // (/{z}/{x}/{y}.png), qu'aucun serveur de tuiles ne sait résoudre —
      // d'où des tuiles qui restent vides (pas mal positionnées : leur
      // transform CSS est correcte, elles n'ont simplement jamais reçu
      // d'image). On reporte donc le recalcul à la fin de l'animation plutôt
      // que de l'interrompre.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((map as any)._animatingZoom) {
        map.once("zoomend", recalculer);
        return;
      }
      map.invalidateSize();
      map.eachLayer((couche) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = couche as any;
        if (typeof c.redraw === "function") c.redraw();
      });
    };
    const observer = new ResizeObserver(() => recalculer());
    observer.observe(conteneur);
    recalculer();
    // Le premier recalcul (juste après le montage, une fois l'animation de
    // setView() initiale terminée) est le plus important : le panneau des
    // 12 régions grandit dès que getRegions() résout, souvent avant que
    // cette animation ne soit finie.
    const t = setTimeout(recalculer, 350);
    return () => {
      observer.disconnect();
      clearTimeout(t);
    };
  }, [map]);
  return null;
}

// Étendue réelle d'un jeu de parcelles (min/max lat/lng) — bbox "vivante"
// dérivée des vraies annonces affichées, jamais codée en dur. `undefined`
// pour ignorer une carte qui n'a pas de liste de parcelles à cadrer (aucun
// appelant actuel dans ce cas, mais `parcelles` reste optionnel pour ne
// pas casser une future réutilisation de VolVersRegion sans ce contexte).
function bboxDe(parcelles: Parcelle[] | undefined): LatLngBoundsExpression | null {
  if (!parcelles || parcelles.length === 0) return null;
  let latMin = Infinity, latMax = -Infinity, lngMin = Infinity, lngMax = -Infinity;
  for (const p of parcelles) {
    const { latitude, longitude } = p.parcelle;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    latMin = Math.min(latMin, latitude);
    latMax = Math.max(latMax, latitude);
    lngMin = Math.min(lngMin, longitude);
    lngMax = Math.max(lngMax, longitude);
  }
  if (!Number.isFinite(latMin)) return null;
  return [[latMin, lngMin], [latMax, lngMax]];
}

// Recentre la carte sur la région active, ou sur l'étendue réelle des
// parcelles affichées si aucune région n'est sélectionnée (`parcelles`) —
// repli sur LIMITES_MAROC (bbox administrative des 12 régions) si cette
// étendue n'est pas calculable (aucune parcelle chargée pour l'instant, ou
// aucun résultat).
//
// Pourquoi pas systématiquement LIMITES_MAROC (comme avant le 19/08) :
// constaté sur la carte plein écran (app/carte/page.tsx, conteneur large -
// 16:9 ou plus) — LIMITES_MAROC est presque aussi haute que large (le
// Maroc est un pays tout en longueur, nord-sud), alors qu'un écran large
// est justement l'inverse. `fitBounds` doit alors dézoomer fortement pour
// ne rien rogner en HAUTEUR, ce qui laisse l'essentiel de la LARGEUR
// occupée par l'Espagne/l'Algérie/l'océan — mathématiquement correct (rien
// n'est coupé) mais inutilisable (tous les pins entassés au centre,
// vérifié : zoom 5 sur un conteneur 1280×736, alors que Casablanca et Fès
// tiennent déjà largement dans un cadrage bien plus serré). L'étendue
// réelle des annonces affichées est nettement moins étirée verticalement
// que la bbox administrative complète (peu d'annonces à l'extrême sud/
// nord) — un cadrage sur cette étendue reste correct (rien de coupé) tout
// en zoomant sensiblement plus près.
export function VolVersRegion({ centre, parcelles }: { centre: [number, number] | null; parcelles?: Parcelle[] }) {
  const map = useMap();
  const precedent = useRef(centre);
  // Distinct du montage lui-même (cf. commentaire ci-dessous) : reste false
  // tant qu'il n'y a ni région active ni parcelles chargées à cadrer.
  const cadrageInitialFait = useRef(false);
  // Recalculé à chaque nouveau `parcelles` (nouvelle page/nouveau filtre) —
  // coût négligeable (une boucle sur au plus 50 éléments) ; ne redéclenche
  // PAS de re-cadrage à chaque fois pour autant, cf. la garde
  // `precedent.current === centre` plus bas dans l'effet.
  const bbox = useMemo(() => bboxDe(parcelles), [parcelles]);

  useEffect(() => {
    if (!cadrageInitialFait.current) {
      // Tant qu'il n'y a ni région active ni parcelle chargée, rien de
      // pertinent à cadrer — attendre le prochain rendu (le fetch initial
      // des parcelles est généralement quasi instantané, cf. plus haut)
      // plutôt que de figer immédiatement un repli LIMITES_MAROC qu'on ne
      // recalculera plus jamais ensuite (le cadrage initial ne s'arme
      // qu'une fois).
      if (!centre && !bbox) return;
      cadrageInitialFait.current = true;
      precedent.current = centre;
      // <MapContainer> est toujours créé cadré sur LIMITES_MAROC (ses props
      // bounds/center/zoom ne servent qu'à cette création initiale, cf. doc
      // react-leaflet) — si `centre` est déjà non nul dès ce premier rendu
      // (ex. la carte remonte alors qu'une région est déjà sélectionnée : la
      // carte du catalogue remonte entièrement à chaque changement de
      // filtre région, cf. <Suspense> autour de useSearchParams() dans
      // app/parcelles/page.tsx), il faut recentrer immédiatement — setView
      // plutôt que flyTo : rien à « survoler » depuis une carte qui vient
      // d'apparaître, et surtout pas de fenêtre d'animation ouverte pendant
      // que RecalculTailleCarte peut, lui aussi, s'exécuter au même instant
      // sur ce montage.
      if (centre) {
        map.setView(centre, 8);
        return;
      }
      // maxZoom : filet de sécurité si les parcelles affichées sont toutes
      // très proches (ex. région filtrée sur une seule ville) — sans lui,
      // une bbox minuscule zoomerait par défaut jusqu'au niveau rue.
      map.fitBounds(bbox ?? LIMITES_MAROC, { padding: [32, 32], maxZoom: 10 });
      return;
    }
    // Une vraie mise à jour (pas un montage) : ne pas relancer un flyTo si
    // `centre` n'a pas changé depuis la dernière fois. Comparaison par
    // référence plutôt que sur l'état réel de la carte (map.getCenter()
    // après un center=[32,-6] initial renvoie ~32.008/-5.9985, jamais
    // exactement [32,-6] — imprécision de projection propre à Leaflet, pas
    // un bug).
    if (precedent.current === centre) return;
    precedent.current = centre;
    if (centre) map.flyTo(centre, 8, { duration: 0.8 });
    else map.flyToBounds(bbox ?? LIMITES_MAROC, { duration: 0.8, padding: [32, 32], maxZoom: 10 });
  }, [centre, map, bbox]);
  return null;
}

// Marqueur + popup d'une parcelle — identique sur les 3 cartes qui affichent
// des annonces (catalogue, couverture Home, comparateur P1-01), jusque-là
// dupliqué tel quel dans CarteLeaflet.tsx et CarteCouvertureLeaflet.tsx.
// Centralisé ici pour que les 3 restent visuellement identiques par
// construction plutôt que par discipline de copier-coller.
export function MarqueurParcelle({ parcelle: p }: { parcelle: Parcelle }) {
  // latitude/longitude sont non-null par contrat (garanti par
  // can_publish()/is_geolocated() côté back pour toute annonce en_ligne,
  // cf. types/parcelle.ts) — mais Leaflet plante toute la carte, pas
  // seulement ce marqueur, sur une valeur non-finie. Filet de sécurité bon
  // marché contre une régression du contrat, pas contre un null attendu.
  if (!Number.isFinite(p.parcelle.latitude) || !Number.isFinite(p.parcelle.longitude)) {
    return null;
  }

  return (
    <Marker position={[p.parcelle.latitude, p.parcelle.longitude]} icon={iconeAkal}>
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
  );
}
