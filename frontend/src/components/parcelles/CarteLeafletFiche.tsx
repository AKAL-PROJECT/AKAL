"use client";

import { MapContainer, TileLayer, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Parcelle } from "@/types/parcelle";

// Rayon affiché en mètres — masque la position exacte tout en situant la zone.
const RAYON_M = 500;

export default function CarteLeafletFiche({ parcelle }: { parcelle: Parcelle }) {
  const coords: [number, number] = [parcelle.parcelle.latitude, parcelle.parcelle.longitude];

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <MapContainer
        center={coords}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%", borderRadius: "var(--radius-card)" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Circle
          center={coords}
          radius={RAYON_M}
          pathOptions={{
            color: "#2D6A4F",
            fillColor: "#52B788",
            fillOpacity: 0.18,
            weight: 2,
            dashArray: "6 4",
          }}
        />
      </MapContainer>

      {/* Bandeau confidentialité — au-dessus de la carte via z-index Leaflet > 400 */}
      <div
        style={{
          position: "absolute",
          bottom: "12px",
          left: "12px",
          right: "12px",
          zIndex: 1000,
          backgroundColor: "white",
          border: "1px solid var(--color-bordure)",
          borderRadius: "var(--radius-sm)",
          padding: "10px 14px",
          fontSize: "12px",
          color: "var(--color-secondaire)",
          boxShadow: "0 2px 8px rgba(27,58,45,0.14)",
          display: "flex",
          alignItems: "flex-start",
          gap: "8px",
          lineHeight: 1.5,
        }}
      >
        <span style={{ fontSize: "14px", flexShrink: 0 }}>&#128274;</span>
        <span>
          <strong style={{ color: "var(--color-texte)" }}>Localisation approximative</strong>
          {" "}— la position exacte de la parcelle peut être communiquée directement par le vendeur après contact.
        </span>
      </div>
    </div>
  );
}
