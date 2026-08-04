"use client";

import { MapContainer, Marker, useMapEvents } from "react-leaflet";
import type L from "leaflet";
import TuileOSM from "@/components/TuileOSM";
import { iconeAkal, CENTRE_MAROC } from "@/lib/leaflet";
import "leaflet/dist/leaflet.css";

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
      <TuileOSM />
      <MarqueurCliquable position={position} onChange={onChange} />
    </MapContainer>
  );
}
