"use client";

import { useState } from "react";
import { MapContainer, Circle, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Parcelle } from "@/types/parcelle";
import TuileOSM from "@/components/TuileOSM";
import { Map as MapIcon } from "@/components/icons/Icons";

// Rayon affiché en mètres — masque la position exacte tout en situant la zone.
const RAYON_M = 500;

// Imagerie satellite — vue par défaut de cette carte (audit fiche du 19/08) :
// une parcelle agricole se juge d'abord au terrain réel (état de la
// végétation, accès, relief visible), que seule une vue satellite montre —
// contrairement au style Positron (CartoCDN) utilisé ailleurs sur le site
// (TuileOSM, cf. audit cartographie précédent), pensé pour un fond de carte
// décoratif/de navigation, pas pour juger un terrain. Esri World Imagery :
// gratuit, sans clé API, même contrainte que CartoDB Positron. Attribution
// dédiée (Esri/Maxar/Earthstar — pas la même chaîne qu'OSM/CARTO).
//
// Ordre {z}/{y}/{x} — PAS {z}/{x}/{y} comme la plupart des serveurs de
// tuiles (dont TuileOSM/CartoDB) : particularité connue des services REST
// ArcGIS Online, à ne pas "corriger" par erreur.
function TuileSatellite() {
  return (
    <TileLayer
      attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      maxZoom={19}
    />
  );
}

type Vue = "satellite" | "plan";

export default function CarteLeafletFiche({ parcelle }: { parcelle: Parcelle }) {
  const { latitude, longitude } = parcelle.parcelle;
  const [vue, setVue] = useState<Vue>("satellite");

  if (latitude == null || longitude == null) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          backgroundColor: "var(--color-surface, #f5f5f5)",
          borderRadius: "var(--radius-card)",
          color: "var(--color-secondaire, #666)",
          fontSize: "14px",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <span style={{ fontSize: "28px" }}>📍</span>
        <strong style={{ color: "var(--color-texte, #333)" }}>Localisation non disponible</strong>
        <span>Les coordonnées de cette parcelle ne sont pas encore renseignées.</span>
      </div>
    );
  }

  const coords: [number, number] = [latitude, longitude];

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <MapContainer
        center={coords}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%", borderRadius: "var(--radius-card)" }}
      >
        {vue === "satellite" ? <TuileSatellite /> : <TuileOSM />}
        {/* Cercle de confidentialité — vert sur les deux fonds (satellite
            comme plan), volontairement le même contour marqué + tirets
            plutôt qu'un simple remplissage, pour rester lisible même sur
            une imagerie satellite chargée visuellement. */}
        <Circle
          center={coords}
          radius={RAYON_M}
          pathOptions={{
            color: "#52B788",
            fillColor: "#52B788",
            fillOpacity: vue === "satellite" ? 0.22 : 0.18,
            weight: 2.5,
            dashArray: "6 4",
          }}
        />
      </MapContainer>

      {/* Bascule Satellite / Plan — pastille flottante en haut à droite,
          même langage visuel que les contrôles flottants de /carte
          (app/carte/page.tsx). Deux boutons plutôt qu'un simple interrupteur
          : l'état actif doit rester lisible d'un coup d'œil sans avoir à
          interpréter la position d'un curseur. */}
      <div
        role="group"
        aria-label="Fond de carte"
        style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          zIndex: 1000,
          display: "flex",
          gap: "2px",
          padding: "3px",
          backgroundColor: "white",
          borderRadius: "var(--radius-full)",
          boxShadow: "0 2px 8px rgba(27,58,45,0.18)",
        }}
      >
        {(["satellite", "plan"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVue(v)}
            aria-pressed={vue === v}
            className="akal-focusable"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "6px 12px",
              borderRadius: "var(--radius-full)",
              border: "none",
              backgroundColor: vue === v ? "var(--color-foret)" : "transparent",
              color: vue === v ? "white" : "var(--color-secondaire)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background-color 150ms ease, color 150ms ease",
            }}
          >
            <MapIcon size={12} />
            {v === "satellite" ? "Satellite" : "Plan"}
          </button>
        ))}
      </div>

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
