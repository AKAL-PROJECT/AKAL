"use client";

import { CircleMarker, MapContainer, Marker, Polygon, useMapEvents } from "react-leaflet";
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

// Un clic ajoute un sommet ; pas de fermeture explicite à cliquer sur la
// carte — <Polygon> relie déjà automatiquement le dernier sommet au premier
// dès qu'il y en a 3 ou plus (le tracé se "ferme" visuellement tout seul).
function PolygoneDessinable({
  sommets,
  onChange,
}: {
  sommets: [number, number][];
  onChange: (sommets: [number, number][]) => void;
}) {
  useMapEvents({
    click(e) {
      onChange([...sommets, [e.latlng.lat, e.latlng.lng]]);
    },
  });

  return (
    <>
      {sommets.length >= 3 && (
        <Polygon
          positions={sommets}
          pathOptions={{ color: "#2D6A4F", weight: 2, fillColor: "#52B788", fillOpacity: 0.25 }}
        />
      )}
      {sommets.map((sommet, i) => (
        <CircleMarker
          key={i}
          center={sommet}
          radius={5}
          pathOptions={{ color: "#2D6A4F", weight: 2, fillColor: "white", fillOpacity: 1 }}
        />
      ))}
    </>
  );
}

type Props =
  | {
      mode: "point";
      position: [number, number] | null;
      onPositionChange: (position: [number, number]) => void;
    }
  | {
      mode: "polygone";
      contour: [number, number][];
      onContourChange: (contour: [number, number][]) => void;
    };

export default function CarteLeafletPicker(props: Props) {
  const centre = props.mode === "point" ? props.position : props.contour[0];

  return (
    <MapContainer
      center={centre ?? CENTRE_MAROC}
      zoom={centre ? 13 : 6}
      style={{ height: "100%", width: "100%", borderRadius: "var(--radius-card)" }}
    >
      <TuileOSM />
      {props.mode === "point" ? (
        <MarqueurCliquable position={props.position} onChange={props.onPositionChange} />
      ) : (
        <PolygoneDessinable sommets={props.contour} onChange={props.onContourChange} />
      )}
    </MapContainer>
  );
}
