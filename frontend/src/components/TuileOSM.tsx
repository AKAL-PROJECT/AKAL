"use client";

import { TileLayer } from "react-leaflet";

// Fond de carte OpenStreetMap — même attribution/URL sur les trois cartes
// Leaflet du projet, aucune personnalisation entre elles. Extrait de la
// duplication relevée par l'audit qualité technique du 2026-08-03.
// URL sans sous-domaine {s} (déprécié/retiré du round-robin OSM officiel
// depuis 2025-ish) et attribution complète ("... contributors", pas juste
// "OpenStreetMap") — corrections de l'audit cartographie du 2026-08-05,
// réappliquées ici après extraction indépendante de ce composant partagé.
export default function TuileOSM() {
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
  );
}
