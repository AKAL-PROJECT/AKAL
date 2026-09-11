"use client";

import { TileLayer } from "react-leaflet";

// Fond de carte « Plan » — même paire de tuiles sur les six cartes Leaflet
// du projet, aucune personnalisation entre elles.
//
// Esri World Light Gray Canvas (base + reference), PAS CartoDB Positron
// (retour utilisateur du 11 sept, reproduit : les tuiles
// `{s}.basemaps.cartocdn.com/light_all/...` renvoient désormais un visuel
// « API KEY REQUIRED » sur toute la carte — CARTO a fermé l'accès anonyme
// à ce point de terminaison après l'écriture du commentaire d'origine, la
// bascule "sans clé API" documentée ici ne tenait donc plus). Esri
// World_Light_Gray_Base/Reference : même style clair/minimaliste que visé
// (fond gris pâle + labels en calque séparé), gratuit et sans clé — même
// service ArcGIS Online déjà utilisé pour TuileSatellite (FondCarte.tsx),
// vérifié à nouveau ici plutôt que supposé après la mésaventure CARTO.
// Deux couches superposées : Esri sépare le fond (Base, sans labels) du
// calque de labels (Reference) plutôt que de les fournir en un seul jeu de
// tuiles comme le faisait CartoDB "light_all".
//
// Ordre {z}/{y}/{x} — PAS {z}/{x}/{y} : particularité des services REST
// ArcGIS Online (même remarque que TuileSatellite, FondCarte.tsx).
export default function TuileOSM() {
  return (
    <>
      <TileLayer
        attribution='Tiles &copy; Esri &mdash; Esri, HERE, Garmin, FAO, NOAA, USGS, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, and the GIS User Community'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        maxZoom={16}
      />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        maxZoom={16}
      />
    </>
  );
}
