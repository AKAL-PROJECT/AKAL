"use client";

import { TileLayer } from "react-leaflet";

// Fond de carte OpenStreetMap — même attribution/URL sur les trois cartes
// Leaflet du projet, aucune personnalisation entre elles. Extrait de la
// duplication relevée par l'audit qualité technique du 2026-08-03.
export default function TuileOSM() {
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
  );
}
