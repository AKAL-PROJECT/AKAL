"use client";

import DimensionBar from "./DimensionBar";
import LigneMeta from "./LigneMeta";
import { type DimensionKey, type Passeport, DIMENSIONS } from "@/lib/passeport-api";
import {
  formatResolution,
  LIBELLE_DIMENSION,
  PRESENTATION_DIMENSION,
} from "@/lib/passeport-presentation";

const formatDate = new Intl.DateTimeFormat("fr-MA", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

// Onglets du passeport : « Aperçu » (toutes les dimensions en barres) + un
// onglet par dimension (détail + traçabilité de la source). Extrait de
// PasseportAgronomiqueScreen — bloc autonome, piloté par l'onglet actif du
// parent.
export default function OngletsPasseport({
  passeport,
  actif,
  onChange,
}: {
  passeport: Passeport;
  actif: "apercu" | DimensionKey;
  onChange: (o: "apercu" | DimensionKey) => void;
}) {
  const onglets: { cle: "apercu" | DimensionKey; label: string }[] = [
    { cle: "apercu", label: "Aperçu" },
    ...DIMENSIONS.map((cle) => ({ cle, label: LIBELLE_DIMENSION[cle].onglet })),
  ];

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "18px" }}>
      <div
        role="tablist"
        aria-label="Dimensions du passeport"
        style={{
          display: "flex",
          overflowX: "auto",
          borderBottom: "1px solid var(--color-bordure)",
        }}
      >
        {onglets.map(({ cle, label }) => {
          const estActif = cle === actif;
          const indispo = cle !== "apercu" && passeport.dimensions[cle].statut !== "ok";
          return (
            <button
              key={cle}
              role="tab"
              type="button"
              aria-selected={estActif}
              aria-controls={`onglet-${cle}`}
              id={`tab-${cle}`}
              onClick={() => onChange(cle)}
              className="akal-focusable"
              style={{
                appearance: "none",
                background: "none",
                border: "none",
                borderBottom: `2px solid ${estActif ? "var(--color-foret)" : "transparent"}`,
                padding: "12px 16px",
                fontSize: "13px",
                fontWeight: estActif ? 600 : 400,
                color: estActif
                  ? "var(--color-foret)"
                  : indispo
                    ? "var(--color-tertiaire)"
                    : "var(--color-secondaire)",
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {label}
              {indispo ? " ·" : ""}
            </button>
          );
        })}
      </div>

      <div id={`onglet-${actif}`} role="tabpanel" aria-labelledby={`tab-${actif}`} style={{ padding: "18px" }}>
        {actif === "apercu" ? (
          <OngletApercu passeport={passeport} onChange={onChange} />
        ) : (
          <OngletDimension dimension={actif} passeport={passeport} />
        )}
      </div>
    </div>
  );
}

function OngletApercu({
  passeport,
  onChange,
}: {
  passeport: Passeport;
  onChange: (o: DimensionKey) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {DIMENSIONS.map((cle) => {
          const d = passeport.dimensions[cle];
          const indispo = d.statut !== "ok";
          const premiere = PRESENTATION_DIMENSION[cle](d.valeurs)[0];
          return (
            <DimensionBar
              key={cle}
              label={LIBELLE_DIMENSION[cle].court}
              sousScore={d.sousScore}
              valeur={premiere ? premiere.valeur : "—"}
              indisponible={indispo}
            />
          );
        })}
      </div>
      <p style={{ fontSize: "12px", color: "var(--color-tertiaire)", marginTop: "14px" }}>
        Ouvrez un onglet pour le détail d&apos;une dimension et sa traçabilité.
      </p>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
        {DIMENSIONS.map((cle) => (
          <button
            key={cle}
            type="button"
            onClick={() => onChange(cle)}
            className="akal-focusable"
            style={{
              appearance: "none",
              border: "1px solid var(--color-bordure)",
              background: "none",
              borderRadius: "var(--radius-full)",
              padding: "3px 10px",
              fontSize: "12px",
              color: "var(--color-secondaire)",
              cursor: "pointer",
            }}
          >
            {LIBELLE_DIMENSION[cle].onglet}
          </button>
        ))}
      </div>
    </div>
  );
}

function OngletDimension({ dimension, passeport }: { dimension: DimensionKey; passeport: Passeport }) {
  const d = passeport.dimensions[dimension];

  if (d.statut !== "ok") {
    return (
      <p style={{ fontSize: "14px", color: "var(--color-secondaire)", lineHeight: 1.6, margin: 0 }}>
        Dimension <strong>{LIBELLE_DIMENSION[dimension].court.toLowerCase()}</strong> indisponible pour cette
        parcelle — elle n&apos;entre pas dans le calcul du score.
      </p>
    );
  }

  const lignes = PRESENTATION_DIMENSION[dimension](d.valeurs).filter((l) => l.valeur !== "—");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <DimensionBar
        label={LIBELLE_DIMENSION[dimension].court}
        sousScore={d.sousScore}
        valeur={d.sousScore === null ? "—" : `${Math.round(d.sousScore)}/100`}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {lignes.map((l) => (
          <LigneMeta key={l.label} label={l.label} valeur={l.valeur} />
        ))}
      </div>
      <div
        style={{
          fontSize: "12px",
          color: "var(--color-tertiaire)",
          paddingTop: "10px",
          borderTop: "1px solid var(--color-bordure)",
          lineHeight: 1.7,
        }}
      >
        <div>
          Source : <strong style={{ color: "var(--color-secondaire)", fontWeight: 500 }}>{d.source}</strong>
          {d.resolutionM ? (
            <>
              {" · "}Résolution :{" "}
              <strong style={{ color: "var(--color-secondaire)", fontWeight: 500 }}>
                {formatResolution(d.resolutionM)}
              </strong>
            </>
          ) : null}
        </div>
        <div>
          Confiance : {Math.round(d.confiance * 100)} % · Collecté le{" "}
          {formatDate.format(new Date(d.dateCollecte))}
          {d.mode === "simule" ? " · valeur simulée" : ""}
        </div>
      </div>
    </div>
  );
}
