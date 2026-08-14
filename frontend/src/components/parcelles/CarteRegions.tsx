"use client";

import { useEffect, useRef, useState } from "react";
import { GeoJSON, useMap } from "react-leaflet";
import type * as GJ from "geojson";
import { apiFetch } from "@/lib/api";
import { CENTRE_MAROC } from "@/lib/leaflet";

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
// non) la sélectionne/désélectionne via `onSelectionner`.
export function LimitesRegions({
  limites,
  codeActif,
  onSelectionner,
}: {
  limites: Record<string, FeatureCollectionProvinces>;
  codeActif: string | null;
  onSelectionner?: (code: string) => void;
}) {
  return (
    <>
      {Object.entries(limites).map(([code, donnees]) => {
        const active = code === codeActif;
        return (
          <GeoJSON
            key={code}
            data={donnees as GJ.FeatureCollection}
            style={{
              color: "#2D6A4F",
              weight: active ? 2.5 : 1,
              fillColor: "#52B788",
              fillOpacity: active ? 0.18 : 0.06,
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

// Recentre la carte sur la région active (ou vue Maroc entière si aucune
// sélection / région sans parcelle donc sans centre calculable).
export function VolVersRegion({ centre }: { centre: [number, number] | null }) {
  const map = useMap();
  const precedent = useRef(centre);
  const monte = useRef(false);
  useEffect(() => {
    if (!monte.current) {
      monte.current = true;
      precedent.current = centre;
      // <MapContainer> est toujours créé à CENTRE_MAROC/zoom 6 (ses props
      // center/zoom ne servent qu'à cette création initiale, cf. doc
      // react-leaflet) — si `centre` est déjà non nul dès ce premier rendu
      // (ex. la carte remonte alors qu'une région est déjà sélectionnée : la
      // carte du catalogue remonte entièrement à chaque changement de
      // filtre région, cf. <Suspense> autour de useSearchParams() dans
      // app/parcelles/page.tsx), il faut recentrer immédiatement — setView
      // plutôt que flyTo : rien à « survoler » depuis une carte qui vient
      // d'apparaître, et surtout pas de fenêtre d'animation ouverte pendant
      // que RecalculTailleCarte peut, lui aussi, s'exécuter au même instant
      // sur ce montage.
      if (centre) map.setView(centre, 8);
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
    else map.flyTo(CENTRE_MAROC, 6, { duration: 0.8 });
  }, [centre, map]);
  return null;
}
