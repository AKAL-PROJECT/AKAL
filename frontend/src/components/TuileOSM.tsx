"use client";

import { TileLayer } from "react-leaflet";

// Fond de carte — même URL/attribution sur les six cartes Leaflet du
// projet, aucune personnalisation entre elles. Extrait de la duplication
// relevée par l'audit qualité technique du 2026-08-03.
//
// CartoDB Positron plutôt que les tuiles OSM "standard" brutes (audit
// cartographie du 19/08) — celles-ci sont très chargées visuellement
// (routes/frontières colorées, labels latins ET arabes superposés à
// chaque ville), ce qui écrasait nos propres contours vert forêt et pins
// d'annonces. Positron est un style clair/minimaliste construit sur les
// mêmes données OSM (© attribution conservée pour les deux, requise par
// leurs licences respectives) — service gratuit sans clé API, cf.
// https://github.com/CartoDB/basemap-styles. `{r}` sert les tuiles @2x
// sur écran Retina (Positron les fournit, contrairement au serveur OSM
// standard) ; `{s}` (sous-domaines a-d) reste supporté côté CARTO,
// contrairement à OSM qui l'a retiré de son propre round-robin.
export default function TuileOSM() {
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      subdomains="abcd"
      maxZoom={19}
    />
  );
}
