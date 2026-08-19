import L, { type LatLngBoundsExpression } from "leaflet";

// Icône de marker AKAL (pin vert forêt) — évite le bug classique des icônes
// Leaflet cassées avec les bundlers. Partagée par les trois cartes Leaflet
// du projet (catalogue, couverture Home, sélecteur de dépôt d'annonce) —
// extrait de la duplication relevée par l'audit qualité technique du
// 2026-08-03. N'importer ce module que depuis un composant "use client"
// chargé en ssr:false (cf. CarteLeaflet.tsx, CarteCouvertureLeaflet.tsx,
// CarteLeafletPicker.tsx) : `leaflet` touche `window` à l'exécution.
export const iconeAkal = L.divIcon({
  className: "",
  html: `<div style="
    width:28px;height:28px;border-radius:50% 50% 50% 0;
    background:#2D6A4F;transform:rotate(-45deg);
    border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);
    display:flex;align-items:center;justify-content:center;">
    <div style="width:8px;height:8px;border-radius:50%;background:white;transform:rotate(45deg);"></div>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

// Centre approximatif du Maroc — vue par défaut du comparateur et du
// sélecteur de dépôt d'annonce tant qu'aucun point n'est encore choisi
// (simple repli neutre, pas un cadrage du pays entier — cf. LIMITES_MAROC
// ci-dessous pour ça).
export const CENTRE_MAROC: [number, number] = [32.0, -6.0];

// Bornes réelles des 12 régions officielles (nord Tanger-Tétouan-Al
// Hoceïma ≈35.9°N → sud Dakhla-Oued Ed-Dahab ≈20.8°N), calculées le
// 2026-08-17 depuis les polygones /api/geo/limites/provinces/ — vue par
// défaut des cartes "Maroc entier" (couverture Home, catalogue). Remplace
// un ancien center=CENTRE_MAROC/zoom=6 fixe : à ce zoom, centré à 32°N,
// Dakhla-Oued Ed-Dahab tombait hors du cadre visible par défaut (signalé
// le 2026-08-17 — "Dakhla ne se voit pas sur la carte"). Avec `bounds` (+
// boundsOptions.padding), Leaflet calcule lui-même le zoom qui fait tenir
// tout le pays, quelle que soit la taille du conteneur (mini-carte Home
// 480px vs carte plein catalogue).
export const LIMITES_MAROC: LatLngBoundsExpression = [
  [20.5, -17.3],
  [36.2, -0.8],
];
