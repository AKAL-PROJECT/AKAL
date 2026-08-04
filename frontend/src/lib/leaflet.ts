import L from "leaflet";

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

// Centre approximatif du Maroc — vue par défaut de toute carte du projet
// tant qu'aucun point/région n'est sélectionné.
export const CENTRE_MAROC: [number, number] = [32.0, -6.0];
