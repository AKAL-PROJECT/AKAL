"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Polygon, useMapEvents } from "react-leaflet";
import L from "leaflet";
import TuileOSM from "@/components/TuileOSM";
import { iconeAkal, CENTRE_MAROC } from "@/lib/leaflet";
import "leaflet/dist/leaflet.css";

// Icône numérotée pour un sommet du contour — distincte du repère principal
// (rond orange plutôt que pin vert) pour qu'on ne confonde jamais "le point
// de la parcelle" et "un sommet du polygone" sur une carte qui affiche les
// deux à la fois (dessin de parcelle, 2026-08-05). Import runtime de
// `leaflet` (pas type-only) : même garde-fou que lib/leaflet.ts, ce module
// n'est chargé que par des composants "use client" en ssr:false.
function iconeSommet(index: number) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:22px;height:22px;border-radius:50%;
      background:#C4622D;border:2px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:600;color:white;">${index + 1}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// Capte les clics sur la carte : ajoute/déplace le repère en mode "point",
// ajoute un sommet en mode "polygone" — un seul MapContainer, le mode
// détermine juste ce qu'un clic produit (les deux couches restent visibles
// et modifiables quel que soit le mode actif).
function GestionnaireClics({
  mode,
  onAjouterPoint,
  onAjouterSommet,
}: {
  mode: "point" | "polygone";
  onAjouterPoint: (position: [number, number]) => void;
  onAjouterSommet: (sommet: [number, number]) => void;
}) {
  useMapEvents({
    click(e) {
      const point: [number, number] = [e.latlng.lat, e.latlng.lng];
      if (mode === "point") onAjouterPoint(point);
      else onAjouterSommet(point);
    },
  });
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GeoJSONFocus({ geojson }: { geojson: any }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (geojson) {
      const layer = L.geoJSON(geojson);
      if (layer.getBounds().isValid()) {
        map.fitBounds(layer.getBounds(), { padding: [20, 20] });
      }
    }
  }, [geojson, map]);
  return null;
}

export default function CarteLeafletPicker({
  mode,
  position,
  onChangePosition,
  contour,
  geojsonCommune,
  onAjouterSommet,
  onDeplacerSommet,
}: {
  mode: "point" | "polygone";
  position: [number, number] | null;
  onChangePosition: (position: [number, number]) => void;
  contour: [number, number][];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geojsonCommune?: any;
  // Ajout/déplacement d'un sommet : délégués au parent sous forme de mises à
  // jour fonctionnelles de state (setContour(prev => ...)), jamais
  // recalculés ici à partir du prop `contour` — deux clics/glissers
  // rapprochés avant le re-render suivant liraient sinon la même fermeture
  // obsolète et s'écraseraient l'un l'autre (un sommet perdu silencieusement).
  onAjouterSommet: (sommet: [number, number]) => void;
  onDeplacerSommet: (index: number, sommet: [number, number]) => void;
}) {
  const centre = position ?? contour[0] ?? CENTRE_MAROC;

  return (
    <MapContainer
      center={centre}
      zoom={position || contour.length ? 13 : 6}
      style={{ height: "100%", width: "100%", borderRadius: "var(--radius-card)" }}
    >
      <TuileOSM />
      <GeoJSONFocus geojson={geojsonCommune} />
      <GestionnaireClics mode={mode} onAjouterPoint={onChangePosition} onAjouterSommet={onAjouterSommet} />

      {position && (
        <Marker
          position={position}
          icon={iconeAkal}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              onChangePosition([p.lat, p.lng]);
            },
          }}
        />
      )}

      {contour.length >= 2 && (
        <Polygon
          positions={contour}
          pathOptions={{ color: "#C4622D", weight: 2, fillColor: "#C4622D", fillOpacity: 0.15 }}
        />
      )}

      {contour.map((sommet, i) => (
        <Marker
          key={i}
          position={sommet}
          icon={iconeSommet(i)}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              onDeplacerSommet(i, [p.lat, p.lng]);
            },
          }}
        />
      ))}
    </MapContainer>
  );
}
