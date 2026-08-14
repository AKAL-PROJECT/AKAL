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
import { formatMAD } from "@/lib/format";
// Cascade P0-04 (région → province → commune) — référentiel officiel
// (2026-08-06), même source et mêmes fonctions que la cascade du dépôt
// d'annonce (EtapeLocalisation.tsx, territoire d'Ibrahim) : lib/geo-api.ts
// est un fichier-frontière, consommé ici en lecture seule.
import { fetchCommunesGeom, fetchProvincesGeom } from "@/lib/geo-api";
import type { CommuneGeomRef, ProvinceGeomRef } from "@/types/depot-annonce";

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

// ── Dropdown générique : liste custom avec cascade d'apparition au clic ──
// Réutilisé pour Région, Province et Commune (P0-04) — un seul jeu de
// styles/comportement (clic dehors, Échap) plutôt que trois quasi-copies.
function DropdownCascade({
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  value: string;
  options: { code: string; nom: string }[];
  placeholder: string;
  disabled?: boolean;
  onChange: (code: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = options.find((o) => o.code === value)?.nom ?? placeholder;

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
        onClick={() => !disabled && setOuvert((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        disabled={disabled}
        className="input"
        style={{
          height: "44px",
          fontSize: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.55 : 1,
          color: value ? "var(--color-texte)" : "var(--color-tertiaire)",
        }}
      >
        <span>{label}</span>
        <ChevronDown
          size={15}
          style={{ color: "var(--color-tertiaire)", transition: "transform 200ms ease", transform: ouvert ? "rotate(180deg)" : "none" }}
        />
      </button>

      {ouvert && !disabled && (
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
          {[{ code: "", nom: placeholder }, ...options].map((o, i) => (
            <button
              key={o.code || "toutes"}
              type="button"
              role="option"
              aria-selected={value === o.code}
              onClick={() => {
                onChange(o.code);
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
                backgroundColor: value === o.code ? "var(--color-rosee)" : "transparent",
                color: value === o.code ? "var(--color-foret)" : "var(--color-texte)",
                animationDelay: `${i * 30}ms`,
                animationDuration: "220ms",
              }}
            >
              {o.nom}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Retour ligne+bouton pour un niveau de cascade en échec (province ou
// commune) : cf. commentaire sur les effets de fetch dans FiltresSidebar. ──
function ErreurCascade({ message, onReessayer }: { message: string; onReessayer: () => void }) {
  return (
    <p style={{ fontSize: 12, color: "var(--color-erreur)", marginTop: 6 }}>
      {message}{" "}
      <button
        type="button"
        onClick={onReessayer}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit",
          color: "inherit",
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        Réessayer
      </button>
    </p>
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

  // Cascade P0-04 — provinces/communes du référentiel officiel, chargées au
  // fil de la sélection (jamais tout le référentiel national d'un coup :
  // 75 provinces/1536 communes, cf. docstring backend geo/api_views.py).
  // `tentative*` ne sert qu'à redéclencher le fetch depuis le bouton
  // Réessayer (incrémenté, sans autre effet).
  const [provinces, setProvinces] = useState<ProvinceGeomRef[]>([]);
  const [communes, setCommunes] = useState<CommuneGeomRef[]>([]);
  const [erreurProvinces, setErreurProvinces] = useState(false);
  const [erreurCommunes, setErreurCommunes] = useState(false);
  const [tentativeProvinces, setTentativeProvinces] = useState(0);
  const [tentativeCommunes, setTentativeCommunes] = useState(0);

  useEffect(() => {
    if (!f.region) return;
    let annule = false;
    fetchProvincesGeom(f.region)
      .then((p) => {
        if (annule) return;
        setProvinces(p);
        setErreurProvinces(false);
      })
      .catch(() => {
        if (annule) return;
        setProvinces([]);
        setErreurProvinces(true);
      });
    return () => {
      annule = true;
    };
  }, [f.region, tentativeProvinces]);

  useEffect(() => {
    if (!f.province) return;
    let annule = false;
    fetchCommunesGeom({ province: Number(f.province) })
      .then((c) => {
        if (annule) return;
        setCommunes(c);
        setErreurCommunes(false);
      })
      .catch(() => {
        if (annule) return;
        setCommunes([]);
        setErreurCommunes(true);
      });
    return () => {
      annule = true;
    };
  }, [f.province, tentativeCommunes]);

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

          {/* Région → Province → Commune (P0-04) — référentiel officiel,
              chaque niveau vide/désactive les suivants à la sélection.
              `options` retombe à [] dès que le parent est vide plutôt que
              de vider `provinces`/`communes` nous-mêmes : évite un flash de
              données obsolètes si l'utilisateur re-choisit vite la même
              région (le fetch en cours écrasera de toute façon l'ancien
              contenu), et rend inutile toute synchronisation d'état dans
              les gestionnaires onChange ci-dessous. */}
          <div>
            <label style={labelStyle}>Région</label>
            <DropdownCascade
              value={f.region}
              options={regions}
              placeholder="Toutes les régions"
              onChange={(code) => onChange({ region: code, province: "", commune: "" })}
            />
          </div>

          <div>
            <label style={labelStyle}>Province</label>
            <DropdownCascade
              value={f.province}
              options={f.region ? provinces.map((p) => ({ code: String(p.id), nom: p.nom })) : []}
              placeholder="Toutes les provinces"
              disabled={!f.region}
              onChange={(code) => onChange({ province: code, commune: "" })}
            />
            {erreurProvinces && (
              <ErreurCascade
                message="Impossible de charger les provinces."
                onReessayer={() => setTentativeProvinces((n) => n + 1)}
              />
            )}
          </div>

          <div>
            <label style={labelStyle}>Commune</label>
            <DropdownCascade
              value={f.commune}
              options={f.province ? communes.map((c) => ({ code: String(c.id), nom: c.nomAffichage })) : []}
              placeholder="Toutes les communes"
              disabled={!f.province}
              onChange={(code) => onChange({ commune: code })}
            />
            {erreurCommunes && (
              <ErreurCascade
                message="Impossible de charger les communes."
                onReessayer={() => setTentativeCommunes((n) => n + 1)}
              />
            )}
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
                {f.prixMax != null ? `${formatMAD.format(f.prixMax)} MAD` : "Illimité"}
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
