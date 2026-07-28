"use client";

import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
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

// Centre approximatif du Maroc — vue par défaut tant qu'aucun point n'est choisi.
const CENTRE_MAROC: [number, number] = [32.0, -6.0];

function MarqueurCliquable({
  position,
  onChange,
}: {
  position: [number, number] | null;
  onChange: (position: [number, number]) => void;
}) {
  useMapEvents({
    click(e) {
      onChange([e.latlng.lat, e.latlng.lng]);
    },
  });

  if (!position) return null;

  return (
    <Marker
      position={position}
      icon={iconeAkal}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const point = (e.target as L.Marker).getLatLng();
          onChange([point.lat, point.lng]);
        },
      }}
    />
  );
}

export default function CarteLeafletPicker({
  position,
  onChange,
}: {
  position: [number, number] | null;
  onChange: (position: [number, number]) => void;
}) {
  return (
    <MapContainer
      center={position ?? CENTRE_MAROC}
      zoom={position ? 13 : 6}
      style={{ height: "100%", width: "100%", borderRadius: "var(--radius-card)" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MarqueurCliquable position={position} onChange={onChange} />
    </MapContainer>
  );
}
