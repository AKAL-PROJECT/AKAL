"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, Marker, Popup, useMap } from "react-leaflet";
import L, { type LatLngBoundsExpression } from "leaflet";
import Link from "next/link";
import type * as GJ from "geojson";
import { apiFetch } from "@/lib/api";
import { LIMITES_MAROC, iconeAkal } from "@/lib/leaflet";
import { formatMAD, formatPrixCourt } from "@/lib/format";
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
  surSatellite,
}: {
  limites: Record<string, FeatureCollectionProvinces>;
  codeActif: string | null;
  codeSurvole?: string | null;
  onSelectionner?: (code: string) => void;
  // Le vert forêt (#2D6A4F) choisi pour le fond "Plan" (Positron, clair) se
  // fond dans les tons sable du Sahara sur le fond satellite (finalisation
  // §1.3, constaté au Sud une fois le satellite activé par défaut) — trait
  // blanc, contraste universellement correct sur océan/végétation/désert.
  surSatellite?: boolean;
}) {
  // Survol réel de la carte (mouseover/mouseout Leaflet sur le polygone
  // lui-même) — distinct de `codeSurvole` (piloté depuis un panneau externe,
  // ex. la liste de régions de CouvertureSection.tsx sur la Home). Le
  // catalogue (/parcelles) et la carte plein écran (/carte) n'ont pas ce
  // panneau et n'avaient donc jusqu'ici aucun survol sur la carte elle-même
  // (finalisation §1.2). Les deux sources cohabitent sans se marcher
  // dessus : `codeSurvole` (externe) reste prioritaire quand fourni, le
  // survol interne prend le relais sinon.
  const [codeSurvoleCarte, setCodeSurvoleCarte] = useState<string | null>(null);
  const codeSurvoleEffectif = codeSurvole ?? codeSurvoleCarte;

  return (
    <>
      {Object.entries(limites).map(([code, donnees]) => {
        const active = code === codeActif;
        const survolee = !active && code === codeSurvoleEffectif;
        return (
          <GeoJSON
            key={code}
            data={donnees as GJ.FeatureCollection}
            style={{
              color: surSatellite ? "#FFFFFF" : "#2D6A4F",
              weight: surSatellite
                ? (active ? 3 : survolee ? 2.5 : 1.5)
                : (active ? 2.5 : survolee ? 2 : 1),
              opacity: surSatellite ? (active ? 0.95 : survolee ? 0.85 : 0.65) : 1,
              fillColor: surSatellite ? "#FFFFFF" : "#52B788",
              fillOpacity: active ? 0.18 : survolee ? 0.13 : 0.06,
            }}
            eventHandlers={{
              ...(onSelectionner ? { click: () => onSelectionner(code) } : {}),
              mouseover: () => setCodeSurvoleCarte(code),
              mouseout: () => setCodeSurvoleCarte((v) => (v === code ? null : v)),
            }}
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

// Bounds Leaflet d'une région (union des provinces qui la composent) —
// mêmes FeatureCollection déjà chargées par useLimitesRegions pour le
// rendu des contours (aucune requête supplémentaire), même technique que
// `zoneBounds` plus bas (L.geoJSON(...).getBounds()). `null` si la
// collection n'est pas encore chargée pour ce code région.
export function boundsDeRegion(fc: FeatureCollectionProvinces | undefined): L.LatLngBounds | null {
  if (!fc || fc.features.length === 0) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = L.geoJSON(fc as any).getBounds();
  return b.isValid() ? b : null;
}

// Bounds Leaflet de "tout le Maroc" — union de toutes les collections
// régionales déjà chargées (mêmes 12 requêtes que le rendu des contours,
// finalisation §1.1/§4 : jamais une bbox codée en dur tant que ces données
// réelles sont disponibles). `null` tant qu'aucune région n'est encore
// chargée — VolVersRegion retombe alors sur LIMITES_MAROC (constante,
// dernier repli uniquement, cf. lib/leaflet.ts).
export function boundsNationalDe(limites: Record<string, FeatureCollectionProvinces>): L.LatLngBounds | null {
  const b = L.latLngBounds([]);
  for (const fc of Object.values(limites)) {
    const rb = boundsDeRegion(fc);
    if (rb) b.extend(rb);
  }
  return b.isValid() ? b : null;
}

// Événement Leaflet interne (pas une vraie interaction utilisateur) —
// émis par VolVersRegion à chaque recadrage programmatique qu'il déclenche
// lui-même. BoutonRechercherZone (CarteLeaflet.tsx) s'y abonne pour réarmer
// sa référence "vue correspondant aux résultats actuels" : sans ça, un
// recadrage qui survient après le délai initial de 900ms (ex. régionBounds/
// boundsNational qui résolvent après le tout premier cadrage, finalisation
// §1.1/§4) fait apparaître "Rechercher cette zone" à tort — la vue vient de
// changer PAR LE CODE, pas par un geste de l'utilisateur.
export const EVENEMENT_RECADRAGE_CARTE = "akal:recadrage";

// Recentre la carte, par ordre de priorité : zone précise (province/commune
// choisie dans les filtres) > région active > tout le Maroc.
//
// Avant la finalisation du 20/08, le cadrage "aucune sélection" se faisait
// sur l'étendue réelle des annonces CHARGÉES plutôt que sur `boundsNational`
// (choix délibéré de l'époque : LIMITES_MAROC, presque aussi haute que
// large, force `fitBounds` à dézoomer fortement sur un écran large pour ne
// rien rogner en hauteur, laissant l'essentiel de la largeur occupée par
// l'Espagne/l'Algérie/l'océan). Problème constaté avec ce choix : dès qu'un
// filtre ne charge aucune annonce au Sud (ex. jeu de données de démo), le
// Sud disparaissait du cadrage par défaut alors que sa géométrie existe et
// est correcte. La consigne de finalisation est explicite (« Maroc dans sa
// globalité, y compris le Sud, par défaut ») — `boundsNational` (calculé,
// jamais codé en dur) est donc redevenu la cible par défaut ; l'étendue des
// annonces (`bbox`) ne sert plus que de filet si `boundsNational` n'a pas
// encore chargé, LIMITES_MAROC restant le tout dernier repli si le fetch
// des régions échoue.
export function VolVersRegion({
  centre,
  parcelles,
  zoneGeometrie,
  regionBounds,
  boundsNational,
}: {
  centre: [number, number] | null;
  parcelles?: Parcelle[];
  // Géométrie GeoJSON (Province ou Commune, cf. lib/geo-api.ts
  // fetchProvinceGeomBounds/fetchCommuneGeomDetail) de la zone la plus
  // précise choisie dans les filtres (audit cascade zoom du 19/08) —
  // prioritaire sur `centre`/`parcelles` dès qu'elle est fournie :
  // quelqu'un qui affine sa recherche jusqu'à une province ou une commune
  // veut voir CETTE zone administrative, pas seulement où se trouvent les
  // quelques pins qui matchent (peut être vide/quasi vide sans que la zone
  // elle-même n'ait de sens à ignorer pour autant).
  zoneGeometrie?: unknown | null;
  // Bounds réelles de la région active (cf. boundsDeRegion ci-dessus) —
  // prioritaire sur `centre` dès qu'elle est disponible ; `centre` reste un
  // repli tant que useLimitesRegions n'a pas encore résolu cette région
  // (finalisation §1.1, remplace l'ancien flyTo à zoom fixe).
  regionBounds?: L.LatLngBounds | null;
  // Bounds de tout le Maroc, calculées depuis les régions déjà chargées
  // (cf. boundsNationalDe) — cible par défaut en l'absence de toute
  // sélection (finalisation §4).
  boundsNational?: L.LatLngBounds | null;
}) {
  const map = useMap();
  const precedent = useRef(centre);
  const precedentZone = useRef(zoneGeometrie);
  // Suit les transitions null -> valeur de boundsNational (résolution du
  // fetch des 12 régions, potentiellement après le tout premier cadrage) —
  // sans ce suivi dédié, un cadrage initial retombé sur `bbox` (régions pas
  // encore chargées) resterait bloqué dessus indéfiniment une fois
  // boundsNational disponible, cf. garde plus bas.
  const precedentBoundsNational = useRef(boundsNational);
  // Distinct du montage lui-même (cf. commentaire ci-dessous) : reste false
  // tant qu'il n'y a ni zone/région active ni parcelles chargées à cadrer.
  const cadrageInitialFait = useRef(false);
  // Recalculé à chaque nouveau `parcelles` (nouvelle page/nouveau filtre) —
  // coût négligeable (une boucle sur au plus 50 éléments) ; ne redéclenche
  // PAS de re-cadrage à chaque fois pour autant, cf. la garde
  // `precedent.current === centre` plus bas dans l'effet.
  const bbox = useMemo(() => bboxDe(parcelles), [parcelles]);
  // Bounds Leaflet de zoneGeometrie — recalculées seulement quand la
  // géométrie change (pas gratuit sur un polygone à plusieurs milliers de
  // sommets). L.geoJSON() accepte une Geometry brute directement (pas
  // besoin de l'envelopper en Feature) — même usage déjà éprouvé dans
  // CarteLeafletPicker.tsx (GeoJSONFocus, dépôt d'annonce).
  const zoneBounds = useMemo(() => {
    if (!zoneGeometrie) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = L.geoJSON(zoneGeometrie as any).getBounds();
    return b.isValid() ? b : null;
  }, [zoneGeometrie]);

  useEffect(() => {
    if (!cadrageInitialFait.current) {
      // Tant qu'il n'y a ni zone/région/Maroc calculable ni parcelle
      // chargée, rien de pertinent à cadrer — attendre le prochain rendu
      // plutôt que de figer immédiatement un repli LIMITES_MAROC qu'on ne
      // recalculera plus jamais ensuite (le cadrage initial ne s'arme
      // qu'une fois).
      if (!zoneBounds && !regionBounds && !centre && !boundsNational && !bbox) return;
      cadrageInitialFait.current = true;
      precedent.current = centre;
      precedentZone.current = zoneGeometrie;
      precedentBoundsNational.current = boundsNational;
      if (zoneBounds) {
        map.fitBounds(zoneBounds, { padding: [24, 24] });
        map.fire(EVENEMENT_RECADRAGE_CARTE);
        return;
      }
      if (regionBounds) {
        map.fitBounds(regionBounds, { padding: [24, 24] });
        map.fire(EVENEMENT_RECADRAGE_CARTE);
        return;
      }
      // <MapContainer> est toujours créé cadré sur LIMITES_MAROC (ses props
      // bounds/center/zoom ne servent qu'à cette création initiale, cf. doc
      // react-leaflet) — si `centre` est déjà non nul dès ce premier rendu
      // (ex. la carte remonte alors qu'une région est déjà sélectionnée : la
      // carte du catalogue remonte entièrement à chaque changement de
      // filtre région, cf. <Suspense> autour de useSearchParams() dans
      // app/parcelles/page.tsx) et que `regionBounds` n'a pas encore résolu,
      // il faut recentrer immédiatement — setView plutôt que flyTo : rien à
      // « survoler » depuis une carte qui vient d'apparaître, et surtout
      // pas de fenêtre d'animation ouverte pendant que RecalculTailleCarte
      // peut, lui aussi, s'exécuter au même instant sur ce montage.
      if (centre) {
        map.setView(centre, 8);
        map.fire(EVENEMENT_RECADRAGE_CARTE);
        return;
      }
      // maxZoom : filet de sécurité si l'étendue à cadrer est minuscule
      // (ex. bbox de secours sur une seule ville) — sans lui, une bbox
      // minuscule zoomerait par défaut jusqu'au niveau rue.
      map.fitBounds(boundsNational ?? bbox ?? LIMITES_MAROC, { padding: [32, 32], maxZoom: 10 });
      map.fire(EVENEMENT_RECADRAGE_CARTE);
      return;
    }

    // Mise à jour (pas un montage) — même ordre de priorité : zone précise
    // > région active > tout le Maroc. Un vol n'est relancé QUE si la cible
    // effectivement utilisée a changé (comparaison par référence, comme
    // pour `centre` plus bas — pas l'état réel de la carte, imprécis par
    // nature avec Leaflet).
    if (zoneBounds) {
      if (precedentZone.current === zoneGeometrie) return;
      precedentZone.current = zoneGeometrie;
      precedent.current = centre;
      map.flyToBounds(zoneBounds, { duration: 0.8, padding: [24, 24] });
      map.fire(EVENEMENT_RECADRAGE_CARTE);
      return;
    }
    // Zone quittée (ex. filtre province/commune vidé) — re-cadrer même si
    // `centre`/`regionBounds` n'ont pas changé entre-temps, sinon la carte
    // resterait bloquée sur les bounds de la province/commune abandonnée.
    const zoneVientDetreQuittee = precedentZone.current != null;
    precedentZone.current = zoneGeometrie;
    // boundsNational vient de résoudre (ex. fetch des 12 régions plus lent
    // que celui des parcelles) alors que le cadrage initial s'était déjà
    // armé sur `bbox`/LIMITES_MAROC — upgrade vers le vrai cadrage national
    // même si `centre` n'a pas changé, cf. commentaire sur le ref plus haut.
    const boundsNationalResolu = precedentBoundsNational.current !== boundsNational;
    precedentBoundsNational.current = boundsNational;
    if (!zoneVientDetreQuittee && !boundsNationalResolu && precedent.current === centre) return;
    precedent.current = centre;
    if (regionBounds) map.flyToBounds(regionBounds, { duration: 0.8, padding: [24, 24] });
    else if (centre) map.flyTo(centre, 8, { duration: 0.8 });
    else map.flyToBounds(boundsNational ?? bbox ?? LIMITES_MAROC, { duration: 0.8, padding: [32, 32], maxZoom: 10 });
    map.fire(EVENEMENT_RECADRAGE_CARTE);
  }, [centre, map, bbox, zoneBounds, zoneGeometrie, regionBounds, boundsNational]);
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
          {/* #AD4E1B (équivalent --color-terre-texte) plutôt que #C4622D —
              4,09:1 sur blanc, sous les 4,5:1 AA à cette taille de texte
              (audit final du 20/08) ; hex littéral gardé comme le reste de
              ce fichier (popup Leaflet), pas de var(--...) introduite ici. */}
          <Link href={`/parcelles/${p.slug}`} style={{ fontSize: "12px", color: "#AD4E1B", textDecoration: "underline" }}>
            Voir l&apos;annonce →
          </Link>
        </div>
      </Popup>
    </Marker>
  );
}

// Repère « pastille de prix » de la carte plein écran (/carte — design 1c) :
// pas de popup, un clic sélectionne l'annonce (le tiroir et la fiche de
// contact en dérivent, source unique côté page). État actif = vert plein +
// ombre marquée, comme dans la maquette. Distinct de MarqueurParcelle
// ci-dessus (pin + popup, utilisé par le catalogue / la couverture Home).
// Hex littéraux comme le reste du fichier (contenu injecté en HTML brut dans
// un L.divIcon, pas de cascade var(--…) accessible ici).
export function MarqueurParcellePrix({
  parcelle: p,
  actif,
  onSelect,
}: {
  parcelle: Parcelle;
  actif: boolean;
  onSelect: (id: string) => void;
}) {
  if (!Number.isFinite(p.parcelle.latitude) || !Number.isFinite(p.parcelle.longitude)) {
    return null;
  }

  const fond = actif ? "#2D6A4F" : "#FFFFFF";
  const texte = actif ? "#FFFFFF" : "#1B3A2D";
  const bordure = actif ? "1.5px solid #1B3A2D" : "1px solid #E8E4DE";
  const ombre = actif ? "0 8px 20px rgba(27,58,45,.28)" : "0 2px 8px rgba(27,58,45,.14)";

  const icone = L.divIcon({
    className: "",
    html: `<span style="box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:999px;font:600 12px/1 'Manrope',system-ui,sans-serif;background:${fond};color:${texte};border:${bordure};box-shadow:${ombre};">${formatPrixCourt(p.prix)}</span>`,
    iconSize: [78, 26],
    iconAnchor: [39, 13],
  });

  return (
    <Marker
      position={[p.parcelle.latitude, p.parcelle.longitude]}
      icon={icone}
      zIndexOffset={actif ? 1000 : 0}
      eventHandlers={{ click: () => onSelect(p.id) }}
    />
  );
}
