"use client";

import { useState } from "react";
import { MapContainer, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Parcelle } from "@/types/parcelle";
import TuileOSM from "@/components/TuileOSM";
import { TuileSatellite, BasculeFondCarte, type VueFond } from "./FondCarte";

// Rayon affiché en mètres — masque la position exacte tout en situant la zone.
const RAYON_M = 500;

// TuileSatellite/BasculeFondCarte extraits dans FondCarte.tsx (finalisation
// §1.3) — réutilisés tels quels sur les cartes de navigation (catalogue,
// carte plein écran, couverture Home). Satellite reste la vue par défaut
// ICI (audit fiche du 19/08) : une parcelle agricole se juge d'abord au
// terrain réel (état de la végétation, accès, relief visible), que seule
// une vue satellite montre.
export default function CarteLeafletFiche({ parcelle }: { parcelle: Parcelle }) {
  const { latitude, longitude } = parcelle.parcelle;
  const [vue, setVue] = useState<VueFond>("satellite");
  // Depuis le hardening du 2026-08-30, la latitude/longitude reçue ici est
  // DÉJÀ floutée côté serveur (~1 km, déterministe) quand loc_confidentielle
  // est activé — la mention ci-dessous n'est donc plus trompeuse. Sinon,
  // c'est l'emplacement indiqué par le vendeur (le cercle reste une zone
  // visuelle, pas un point cadastral).
  const confidentielle = parcelle.locConfidentielle ?? false;

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

      <BasculeFondCarte vue={vue} onChange={setVue} />

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
          {confidentielle ? (
            <>
              <strong style={{ color: "var(--color-texte)" }}>Localisation approximative</strong>
              {" "}— le vendeur a choisi de masquer l&apos;emplacement exact&nbsp;; il pourra vous le communiquer après contact.
            </>
          ) : (
            <>
              <strong style={{ color: "var(--color-texte)" }}>Emplacement indiqué par le vendeur</strong>
              {" "}— zone approximative, à confirmer avec lui avant toute visite.
            </>
          )}
        </span>
      </div>
    </div>
  );
}
