"use client";

import { MapContainer, TileLayer, Marker, Polygon, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Même icône que CarteLeaflet.tsx (pin vert forêt, évite le bug classique
// des icônes Leaflet cassées avec les bundlers).
const iconeAkal = L.divIcon({
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

// Icône numérotée pour un sommet du contour — distincte du repère principal
// (rond orange plutôt que pin vert) pour qu'on ne confonde jamais "le point
// de la parcelle" et "un sommet du polygone" sur une carte qui affiche les
// deux à la fois (dessin de parcelle, 2026-08-05).
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

// Centre approximatif du Maroc — vue par défaut tant qu'aucun point ni sommet n'existe.
const CENTRE_MAROC: [number, number] = [32.0, -6.0];

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

export default function CarteLeafletPicker({
  mode,
  position,
  onChangePosition,
  contour,
  onAjouterSommet,
  onDeplacerSommet,
}: {
  mode: "point" | "polygone";
  position: [number, number] | null;
  onChangePosition: (position: [number, number]) => void;
  contour: [number, number][];
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
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
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
