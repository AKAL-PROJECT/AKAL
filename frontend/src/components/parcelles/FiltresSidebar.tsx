"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACCES_EAU_OPTIONS,
  STATUTS,
  type FiltresState,
  type Region,
  filtresActifs,
} from "@/data/parcelles";
import { STATUT_FONCIER_LABEL } from "./BadgeStatut";
import { Search, X, ChevronDown, Check } from "@/components/icons/Icons";

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  filtres: FiltresState;
  onChange: (patch: Partial<FiltresState>) => void;
  onReinitialiser: () => void;
  // Régions chargées une seule fois par la page catalogue (GET /api/geo/regions/),
  // pas ici — évite un fetch par instance de sidebar.
  regions: Region[];
  // Mobile : ferme simplement le drawer (la liste est déjà à jour en live).
  onAppliquer: () => void;
};

// Parse un input numérique en number | null (champ vide => null, pas de filtre).
function parseNum(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Bornes indicatives des sliders — le contrat n'expose pas de min/max réel
// du catalogue (§4.2), ce sont donc des bornes larges et arrondies, pas des
// valeurs calculées depuis les données. Le champ "min" à côté du slider
// reste un input libre pour dépasser ces bornes si besoin.
const PRIX_MAX_BORNE = 5_000_000;
const SURFACE_MAX_BORNE = 50;

const fmtMAD = new Intl.NumberFormat("fr-MA");

// ── Dropdown Région : liste custom avec cascade d'apparition au clic ──────
function DropdownRegion({
  value,
  regions,
  onChange,
}: {
  value: string;
  regions: Region[];
  onChange: (code: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = regions.find((r) => r.code === value)?.nom ?? "Toutes les régions";

  useEffect(() => {
    if (!ouvert) return;
    const fermerSiDehors = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false);
    };
    const fermerSurEchap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("mousedown", fermerSiDehors);
    document.addEventListener("keydown", fermerSurEchap);
    return () => {
      document.removeEventListener("mousedown", fermerSiDehors);
      document.removeEventListener("keydown", fermerSurEchap);
    };
  }, [ouvert]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        className="input"
        style={{
          height: "44px",
          fontSize: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          color: value ? "var(--color-texte)" : "var(--color-tertiaire)",
        }}
      >
        <span>{label}</span>
        <ChevronDown
          size={15}
          style={{ color: "var(--color-tertiaire)", transition: "transform 200ms ease", transform: ouvert ? "rotate(180deg)" : "none" }}
        />
      </button>

      {ouvert && (
        <div
          role="listbox"
          className="akal-pop-in"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 40,
            backgroundColor: "white",
            border: "1px solid var(--color-bordure)",
            borderRadius: "var(--radius-btn)",
            boxShadow: "var(--shadow-card-hover)",
            maxHeight: "260px",
            overflowY: "auto",
            padding: "6px",
          }}
        >
          {[{ code: "", nom: "Toutes les régions" }, ...regions].map((r, i) => (
            <button
              key={r.code || "toutes"}
              type="button"
              role="option"
              aria-selected={value === r.code}
              onClick={() => {
                onChange(r.code);
                setOuvert(false);
              }}
              className="akal-card-cascade"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "9px 10px",
                fontSize: "13px",
                borderRadius: "var(--radius-xs)",
                border: "none",
                cursor: "pointer",
                backgroundColor: value === r.code ? "var(--color-rosee)" : "transparent",
                color: value === r.code ? "var(--color-foret)" : "var(--color-texte)",
                animationDelay: `${i * 30}ms`,
                animationDuration: "220ms",
              }}
            >
              {r.nom}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FiltresSidebar({
  ouverte,
  onFermer,
  filtres,
  onChange,
  onReinitialiser,
  regions,
  onAppliquer,
}: Props) {
  const f = filtres;

  return (
    <>
      {/* Overlay mobile */}
      {ouverte && (
        <div
          onClick={onFermer}
          style={{
            position: "fixed",
            inset: 0,
            top: "64px",
            backgroundColor: "rgba(17,26,21,0.4)",
            zIndex: 25,
          }}
          className="hidden-desktop akal-fade-in"
        />
      )}

      <aside
        className={`filtres-sidebar ${ouverte ? "filtres-sidebar--ouverte" : ""}`}
        aria-label="Filtres de recherche"
      >
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Titre */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-texte)" }}>Filtres</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                type="button"
                onClick={onReinitialiser}
                disabled={!filtresActifs(f)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: filtresActifs(f) ? "pointer" : "default",
                  fontSize: "12px",
                  textDecoration: filtresActifs(f) ? "underline" : "none",
                  color: filtresActifs(f) ? "var(--color-terre-texte)" : "var(--color-tertiaire)",
                  opacity: filtresActifs(f) ? 1 : 0.6,
                }}
              >
                Réinitialiser les filtres
              </button>
              <button
                type="button"
                onClick={onFermer}
                aria-label="Fermer les filtres"
                className="hidden-desktop"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-tertiaire)", display: "flex" }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Recherche textuelle — limitée à la page actuellement chargée
              (pas de paramètre `q=` documenté côté API, cf. lib/parcelles.ts). */}
          <div style={{ position: "relative" }}>
            <Search
              size={14}
              style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--color-tertiaire)" }}
            />
            <input
              className="input"
              placeholder="Rechercher dans cette page…"
              value={f.recherche}
              onChange={(e) => onChange({ recherche: e.target.value })}
              style={{ height: "44px", paddingLeft: "36px", fontSize: "14px" }}
            />
          </div>

          {/* Région — dropdown custom avec cascade d'apparition au clic */}
          <div>
            <label style={labelStyle}>Région</label>
            <DropdownRegion value={f.region} regions={regions} onChange={(code) => onChange({ region: code })} />
          </div>

          {/* Statut foncier — rendu en chips façon "checkbox", mais
              sélection unique : le contrat ne documente pas de multi-valeurs
              pour ce filtre (§4.2). Cliquer sur la chip active la désactive. */}
          <div>
            <label style={labelStyle}>Statut foncier</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {STATUTS.map((s) => {
                const actif = f.statutFoncier === s;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={actif}
                    onClick={() => onChange({ statutFoncier: actif ? "" : s })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px 12px",
                      fontSize: "13px",
                      borderRadius: "var(--radius-full)",
                      cursor: "pointer",
                      border: `1px solid ${actif ? "var(--color-foret)" : "var(--color-bordure)"}`,
                      backgroundColor: actif ? "var(--color-rosee)" : "white",
                      color: actif ? "var(--color-foret)" : "var(--color-texte)",
                      transition: "all 150ms ease",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: "13px",
                        height: "13px",
                        borderRadius: "var(--radius-xs)",
                        border: `1.5px solid ${actif ? "var(--color-foret)" : "var(--color-tertiaire)"}`,
                        backgroundColor: actif ? "var(--color-foret)" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {actif && <Check size={10} strokeWidth={3} style={{ color: "white" }} />}
                    </span>
                    {STATUT_FONCIER_LABEL[s].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prix — slider Max + input Min pour affiner. */}
          <div>
            <label style={labelStyle}>
              Prix max
              <span style={{ float: "right", fontWeight: 500, color: "var(--color-foret)", fontVariantNumeric: "tabular-nums" }}>
                {f.prixMax != null ? `${fmtMAD.format(f.prixMax)} MAD` : "Illimité"}
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={PRIX_MAX_BORNE}
              step={50_000}
              value={f.prixMax ?? PRIX_MAX_BORNE}
              onChange={(e) => {
                const v = Number(e.target.value);
                onChange({ prixMax: v >= PRIX_MAX_BORNE ? null : v });
              }}
              style={{ width: "100%", accentColor: "var(--color-foret)", cursor: "pointer" }}
              aria-label="Prix maximum en MAD"
            />
            <input
              className="input"
              type="number"
              inputMode="numeric"
              placeholder="Prix min (MAD)"
              value={f.prixMin ?? ""}
              onChange={(e) => onChange({ prixMin: parseNum(e.target.value) })}
              style={{ ...miniInputStyle, width: "100%", marginTop: "8px" }}
            />
          </div>

          {/* Surface — slider Max + input Min pour affiner. */}
          <div>
            <label style={labelStyle}>
              Surface max
              <span style={{ float: "right", fontWeight: 500, color: "var(--color-foret)", fontVariantNumeric: "tabular-nums" }}>
                {f.surfaceMax != null ? `${f.surfaceMax} ha` : "Illimité"}
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={SURFACE_MAX_BORNE}
              step={0.5}
              value={f.surfaceMax ?? SURFACE_MAX_BORNE}
              onChange={(e) => {
                const v = Number(e.target.value);
                onChange({ surfaceMax: v >= SURFACE_MAX_BORNE ? null : v });
              }}
              style={{ width: "100%", accentColor: "var(--color-foret)", cursor: "pointer" }}
              aria-label="Surface maximum en hectares"
            />
            <input
              className="input"
              type="number"
              inputMode="decimal"
              placeholder="Surface min (ha)"
              value={f.surfaceMin ?? ""}
              onChange={(e) => onChange({ surfaceMin: parseNum(e.target.value) })}
              style={{ ...miniInputStyle, width: "100%", marginTop: "8px" }}
            />
          </div>

          {/* Eau */}
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={labelStyle}>Accès à l&apos;eau</legend>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", fontSize: "13px", color: "var(--color-texte)" }}>
                <input
                  type="radio"
                  name="eau"
                  checked={f.eau === "tous"}
                  onChange={() => onChange({ eau: "tous" })}
                  style={{ accentColor: "var(--color-foret)" }}
                />{" "}
                Tous
              </label>
              {ACCES_EAU_OPTIONS.map((o) => (
                <label key={o.value} style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", fontSize: "13px", color: "var(--color-texte)" }}>
                  <input
                    type="radio"
                    name="eau"
                    checked={f.eau === o.value}
                    onChange={() => onChange({ eau: o.value })}
                    style={{ accentColor: "var(--color-foret)" }}
                  />{" "}
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Mobile uniquement : ferme le drawer (liste déjà filtrée en live). */}
          <button className="btn-primary hidden-desktop" style={{ width: "100%" }} onClick={onAppliquer}>
            Voir les résultats
          </button>
        </div>
      </aside>
    </>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 500,
  marginBottom: "8px",
  color: "var(--color-secondaire)",
};

const miniInputStyle: React.CSSProperties = {
  height: "40px",
  fontSize: "13px",
  padding: "0 12px",
};
