"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search } from "@/components/icons/Icons";
import type { Region } from "@/data/parcelles";

type Mode = "region" | "autour" | "carte";

// Centroïdes approximatifs (ville principale) des 12 régions officielles —
// suffisant pour "quelle région est la plus proche de moi", pas pour une
// recherche par rayon précise (aucune des deux pages resultats — /parcelles,
// /carte — n'accepte de bbox arbitraire depuis l'URL : "rechercher cette
// zone" y est une action ponctuelle sur la carte, jamais persistée dans le
// lien, cf. commentaire sur `bbox` dans app/parcelles/page.tsx). Même
// simplification (distance euclidienne en degrés) que le tri du tiroir de
// résultats de la carte plein écran (carte/page.tsx::distance2).
const CENTROIDES_REGIONS: Record<string, { lat: number; lng: number }> = {
  "tanger-tetouan-al-hoceima": { lat: 35.7595, lng: -5.834 },
  oriental: { lat: 34.6814, lng: -1.9086 },
  "fes-meknes": { lat: 34.0331, lng: -5.0003 },
  "rabat-sale-kenitra": { lat: 34.0209, lng: -6.8417 },
  "beni-mellal-khenifra": { lat: 32.3373, lng: -6.3498 },
  "casablanca-settat": { lat: 33.5731, lng: -7.5898 },
  "marrakech-safi": { lat: 31.6295, lng: -8.0089 },
  "draa-tafilalet": { lat: 31.9314, lng: -4.4245 },
  "souss-massa": { lat: 30.4278, lng: -9.5981 },
  "guelmim-oued-noun": { lat: 28.9862, lng: -10.0574 },
  "laayoune-sakia-el-hamra": { lat: 27.1418, lng: -13.1873 },
  "dakhla-oued-ed-dahab": { lat: 23.6848, lng: -15.958 },
};

function regionLaPlusProche(lat: number, lng: number): string | null {
  let meilleur: string | null = null;
  let meilleureDistance = Infinity;
  for (const [code, c] of Object.entries(CENTROIDES_REGIONS)) {
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
    if (d < meilleureDistance) {
      meilleureDistance = d;
      meilleur = code;
    }
  }
  return meilleur;
}

const SURFACES = [
  { valeur: "", label: "Toutes" },
  { valeur: "-5", label: "Moins de 5 ha" },
  { valeur: "5-20", label: "5 à 20 ha" },
  { valeur: "20-", label: "Plus de 20 ha" },
];

// Raccourcis vers de vrais critères déjà supportés par AnnonceAPIFilter
// (backend/annonces/api_views.py) — jamais décoratifs.
const RACCOURCIS: { label: string; params: Record<string, string> }[] = [
  { label: "Terrains irrigables", params: { acces_eau: "irriguee" } },
  { label: "Moins de 1 M MAD", params: { prix_max: "1000000" } },
  { label: "Plus de 20 ha", params: { surface_min: "20" } },
  { label: "Titre foncier", params: { statut_foncier: "immatricule" } },
];

const MODES: { id: Mode; label: string }[] = [
  { id: "region", label: "Par région" },
  { id: "autour", label: "Autour de moi" },
  { id: "carte", label: "Dessiner sur la carte" },
];

function surfaceEnParams(valeur: string): Record<string, string> {
  if (!valeur) return {};
  const [min, max] = valeur.split("-");
  const params: Record<string, string> = {};
  if (min) params.surface_min = min;
  if (max) params.surface_max = max;
  return params;
}

export default function HeroRecherche({ regions }: { regions: Region[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("region");
  const [region, setRegion] = useState("");
  const [surface, setSurface] = useState("");
  const [prixMax, setPrixMax] = useState("");
  const [geoPending, setGeoPending] = useState(false);
  const [geoErreur, setGeoErreur] = useState<string | null>(null);

  function paramsCommuns(): Record<string, string> {
    const params = { ...surfaceEnParams(surface) };
    if (prixMax) params.prix_max = prixMax;
    return params;
  }

  function rechercherRegion(regionCode: string) {
    const sp = new URLSearchParams({ ...paramsCommuns(), ...(regionCode ? { region: regionCode } : {}) });
    router.push(sp.toString() ? `/parcelles?${sp}` : "/parcelles");
  }

  function rechercherAutourDeMoi() {
    if (!("geolocation" in navigator)) {
      setGeoErreur("La géolocalisation n'est pas disponible sur cet appareil/navigateur.");
      return;
    }
    setGeoPending(true);
    setGeoErreur(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoPending(false);
        const proche = regionLaPlusProche(position.coords.latitude, position.coords.longitude);
        rechercherRegion(proche ?? "");
      },
      (err) => {
        setGeoPending(false);
        setGeoErreur(
          err.code === err.PERMISSION_DENIED
            ? "Position refusée — autorisez la géolocalisation dans les réglages du navigateur pour utiliser cette option."
            : "Impossible d'obtenir votre position pour le moment. Réessayez, ou cherchez par région."
        );
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  function rechercherSurCarte() {
    // Le dessin d'un périmètre libre vit sur la carte plein écran elle-même
    // (CarteLeaflet.tsx, "rechercher cette zone") — jamais depuis une bbox
    // dans l'URL (choix explicite, cf. commentaire sur `bbox` dans
    // app/parcelles/page.tsx). Ici, on transmet seulement surface/budget —
    // les deux critères que /carte sait déjà relire depuis l'URL — et on
    // laisse l'utilisateur dessiner sa zone une fois arrivé.
    const sp = new URLSearchParams(paramsCommuns());
    router.push(sp.toString() ? `/carte?${sp}` : "/carte");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "region") rechercherRegion(region);
    else if (mode === "autour") rechercherAutourDeMoi();
    else rechercherSurCarte();
  }

  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        backgroundColor: "var(--color-fond)",
      }}
    >
      <div className="akal-texture-topo" aria-hidden style={{ opacity: 0.35 }} />
      <div className="akal-texture-cadastre" aria-hidden />

      <div
        style={{
          position: "relative",
          maxWidth: "900px",
          margin: "0 auto",
          textAlign: "center",
          padding: "clamp(64px, 10vw, 104px) clamp(24px, 6vw, 64px) clamp(56px, 8vw, 88px)",
        }}
      >
        <span className="eyebrow akal-push-up" style={{ justifyContent: "center", animationDelay: "0ms" }}>
          Marketplace foncière — Maroc
        </span>

        <h1
          className="display-1 akal-push-up"
          style={{ color: "var(--color-nuit)", margin: "18px 0 14px", animationDelay: "80ms" }}
        >
          Quel terrain cherchez-vous ?
        </h1>

        <p
          className="lede akal-push-up"
          style={{ maxWidth: "520px", margin: "0 auto 28px", animationDelay: "160ms" }}
        >
          Dites-nous où et combien : nous vous montrons les parcelles disponibles, avec leur statut
          foncier et leur passeport agronomique.
        </p>

        {/* Onglets de mode — alignés à gauche du panneau, coin haut-gauche
            carré (ils s'y rattachent visuellement). */}
        <div
          className="akal-push-up"
          style={{ display: "flex", gap: "4px", justifyContent: "flex-start", paddingLeft: "10px", animationDelay: "220ms" }}
        >
          {MODES.map((m) => {
            const actif = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMode(m.id);
                  setGeoErreur(null);
                }}
                className="akal-focusable"
                style={{
                  padding: "11px 20px",
                  cursor: "pointer",
                  border: "none",
                  borderRadius: "var(--radius-md) var(--radius-md) 0 0",
                  fontFamily: "inherit",
                  fontSize: "14px",
                  fontWeight: actif ? 600 : 500,
                  backgroundColor: actif ? "#fff" : "rgba(255,255,255,0.45)",
                  color: actif ? "var(--color-nuit)" : "var(--color-secondaire)",
                  boxShadow: actif ? "0 -2px 10px rgba(27,58,45,0.06)" : "none",
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <form
          onSubmit={onSubmit}
          className="akal-push-up"
          style={{
            backgroundColor: "#fff",
            borderRadius: "0 var(--radius-lg) var(--radius-lg) var(--radius-lg)",
            boxShadow: "var(--shadow-3)",
            padding: "10px",
            display: "flex",
            alignItems: "stretch",
            gap: "2px",
            textAlign: "left",
            flexWrap: "wrap",
            animationDelay: "260ms",
          }}
        >
          {mode === "region" && (
            <>
              <label style={champStyle}>
                <span style={champLabelStyle}>Où</span>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="select-chevron akal-hero-field"
                  style={champValeurSelectStyle}
                >
                  <option value="">Toutes régions</option>
                  {regions.map((r) => (
                    <option key={r.code} value={r.code}>{r.nom}</option>
                  ))}
                </select>
              </label>
              <span style={separateurStyle} className="hidden-mobile" />
            </>
          )}

          {mode === "autour" && (
            <>
              <div style={champStyle}>
                <span style={champLabelStyle}>Rayon autour de moi</span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "2px 0" }}>
                  <MapPin size={16} strokeWidth={1.75} style={{ color: "var(--color-foret)", flexShrink: 0 }} />
                  <span style={{ fontSize: "15.5px", color: geoErreur ? "var(--color-erreur)" : "var(--color-texte)" }}>
                    {geoPending
                      ? "Localisation en cours…"
                      : geoErreur
                        ? geoErreur
                        : "Votre position, au clic sur « Rechercher »"}
                  </span>
                </div>
              </div>
              <span style={separateurStyle} className="hidden-mobile" />
            </>
          )}

          {mode === "carte" && (
            <>
              <div style={champStyle}>
                <span style={champLabelStyle}>Zone</span>
                <span style={{ fontSize: "15.5px", color: "var(--color-tertiaire)", padding: "2px 0", display: "block" }}>
                  Tracez votre périmètre une fois sur la carte
                </span>
              </div>
              <span style={separateurStyle} className="hidden-mobile" />
            </>
          )}

          <label style={champStyle}>
            <span style={champLabelStyle}>Surface</span>
            <select
              value={surface}
              onChange={(e) => setSurface(e.target.value)}
              className="select-chevron akal-hero-field"
              style={champValeurSelectStyle}
            >
              {SURFACES.map((s) => (
                <option key={s.valeur} value={s.valeur}>{s.label}</option>
              ))}
            </select>
          </label>
          <span style={separateurStyle} className="hidden-mobile" />
          <label style={{ ...champStyle, flex: "1 1 150px" }}>
            <span style={champLabelStyle}>Budget max</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="Indifférent"
              value={prixMax}
              onChange={(e) => setPrixMax(e.target.value)}
              className="akal-hero-field"
              style={{ ...champValeurSelectStyle, border: "none", width: "100%" }}
            />
          </label>

          <button
            type="submit"
            className="btn-primary"
            disabled={geoPending}
            style={{ flex: "none", display: "flex", alignItems: "center", gap: "9px", padding: "0 26px" }}
          >
            <Search size={16} />
            Rechercher
          </button>
        </form>

        <div
          className="akal-push-up"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "9px", marginTop: "20px", flexWrap: "wrap", animationDelay: "320ms" }}
        >
          <span style={{ fontSize: "13px", color: "var(--color-tertiaire)" }}>Recherches fréquentes</span>
          {RACCOURCIS.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => router.push(`/parcelles?${new URLSearchParams(r.params)}`)}
              className="akal-focusable"
              style={{
                fontSize: "13px",
                padding: "6px 13px",
                borderRadius: "var(--radius-full)",
                backgroundColor: "#fff",
                border: "1px solid var(--color-bordure)",
                color: "var(--color-nuit)",
                cursor: "pointer",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div
          className="akal-push-up"
          style={{ display: "flex", justifyContent: "center", gap: "44px", marginTop: "34px", animationDelay: "360ms" }}
        >
          {STATS.map((s) => (
            <div key={s.label}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: "28px", color: "var(--color-nuit)" }}>{s.valeur}</div>
              <div style={{ fontSize: "12.5px", color: "var(--color-tertiaire)", marginTop: "2px" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Faits de structure du produit (nombre de régions couvertes par le
// référentiel géo, de statuts fonciers et de dimensions du passeport
// agronomique) — pas des compteurs d'inventaire dérivés du catalogue : ils
// ne varient pas avec le nombre d'annonces publiées, contrairement à un
// total d'annonces qui, lui, aurait besoin d'être recalculé côté serveur.
const STATS = [
  { valeur: "12", label: "régions couvertes" },
  { valeur: "5", label: "statuts fonciers déclarés" },
  { valeur: "5", label: "dimensions analysées" },
];

const champStyle: React.CSSProperties = {
  flex: "1 1 170px",
  minWidth: 0,
  padding: "10px 16px",
  borderRadius: "var(--radius-sm)",
  display: "block",
};

const champLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11.5px",
  fontWeight: 600,
  letterSpacing: "0.05em",
  color: "var(--color-foret)",
  marginBottom: "4px",
};

const champValeurSelectStyle: React.CSSProperties = {
  fontSize: "15.5px",
  color: "var(--color-texte)",
  background: "none",
  border: "none",
  padding: 0,
  width: "100%",
};

const separateurStyle: React.CSSProperties = {
  width: "1px",
  alignSelf: "center",
  height: "38px",
  backgroundColor: "var(--color-bordure)",
};
