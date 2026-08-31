"use client";

import { TileLayer } from "react-leaflet";
import { Map as MapIcon } from "@/components/icons/Icons";

// Imagerie satellite — extrait de CarteLeafletFiche.tsx (finalisation §1.3,
// audit fiche du 19/08 à l'origine) pour être réutilisé sur les cartes de
// navigation (catalogue, carte plein écran, couverture Home), qui n'avaient
// jusqu'ici que TuileOSM. Une parcelle agricole se juge d'abord au terrain
// réel (végétation, accès, relief), que seule une vue satellite montre —
// contrairement au style Positron (TuileOSM), pensé pour un fond de carte
// décoratif/de navigation. Esri World Imagery : gratuit, sans clé API,
// même contrainte que CartoDB Positron. Attribution dédiée (Esri/Maxar/
// Earthstar — pas la même chaîne qu'OSM/CARTO).
//
// Ordre {z}/{y}/{x} — PAS {z}/{x}/{y} comme la plupart des serveurs de
// tuiles (dont TuileOSM/CartoDB) : particularité connue des services REST
// ArcGIS Online, à ne pas "corriger" par erreur.
export function TuileSatellite() {
  return (
    <TileLayer
      attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      maxZoom={19}
    />
  );
}

export type VueFond = "satellite" | "plan";

// Bascule Satellite / Plan — pastille flottante, même langage visuel
// partout (fiche annonce, catalogue, carte plein écran, couverture Home) :
// extrait de CarteLeafletFiche.tsx pour éviter la duplication (finalisation
// §1.3, "éviter les duplications de logique"). Deux boutons plutôt qu'un
// simple interrupteur : l'état actif doit rester lisible d'un coup d'œil
// sans avoir à interpréter la position d'un curseur.
export function BasculeFondCarte({
  vue,
  onChange,
}: {
  vue: VueFond;
  onChange: (v: VueFond) => void;
}) {
  return (
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
          onClick={() => onChange(v)}
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
  );
}
