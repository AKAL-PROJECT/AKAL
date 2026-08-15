"use client";

import { MapContainer, Marker, Popup } from "react-leaflet";
import Link from "next/link";
import type { Parcelle } from "@/types/parcelle";
import TuileOSM from "@/components/TuileOSM";
import { iconeAkal, CENTRE_MAROC } from "@/lib/leaflet";
import { formatMAD } from "@/lib/format";
import "leaflet/dist/leaflet.css";

export default function CarteLeaflet({ parcelles }: { parcelles: Parcelle[] }) {
  return (
    <MapContainer
      center={CENTRE_MAROC}
      zoom={6}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", borderRadius: "var(--radius-card)" }}
    >
      <TuileOSM />
      {parcelles
        .filter((p) => p.parcelle.latitude != null && p.parcelle.longitude != null)
        .map((p) => (
          <Marker
            key={p.id}
            position={[p.parcelle.latitude as number, p.parcelle.longitude as number]}
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