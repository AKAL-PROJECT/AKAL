"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import Link from "next/link";
import type { Parcelle } from "@/types/parcelle";
import "leaflet/dist/leaflet.css";

// Icône de marker personnalisée AKAL (pin vert forêt) — évite le bug
// classique des icônes Leaflet cassées avec les bundlers.
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

const formatMAD = new Intl.NumberFormat("fr-MA");

export default function CarteLeaflet({ parcelles }: { parcelles: Parcelle[] }) {
  // Centre approximatif du Maroc
  const centre: [number, number] = [32.0, -6.0];

  return (
    <MapContainer
      center={centre}
      zoom={6}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", borderRadius: "var(--radius-card)" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {parcelles.map((p) => (
        <Marker
          key={p.id}
          position={[p.parcelle.latitude, p.parcelle.longitude]}
          icon={iconeAkal}
        >
          <Popup>
            <div style={{ minWidth: "160px" }}>
              <strong style={{ fontSize: "13px", color: "#2D6A4F" }}>{p.titre}</strong>
              <div style={{ fontSize: "12px", color: "#555", margin: "4px 0" }}>
                {p.parcelle.regionNom} · {p.parcelle.surface} ha
              </div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#2D6A4F" }}>
                {formatMAD.format(p.prix)} MAD
              </div>
              <Link href={`/parcelles/${p.slug}`} style={{ fontSize: "12px", color: "#C4622D", textDecoration: "underline" }}>
                Voir l&apos;annonce →
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}