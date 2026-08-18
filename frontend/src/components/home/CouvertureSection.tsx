"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MapPin } from "@/components/icons/Icons";
import { Reveal } from "@/components/Reveal";
import type { Parcelle } from "@/types/parcelle";
import { getRegions, getStatsParRegion, type Region, type StatRegion } from "@/data/parcelles";
import type { RegionActive } from "@/components/parcelles/CarteCouvertureLeaflet";

// Leaflet touche `window`, absent au rendu serveur (SSR) — chargement
// client uniquement, même contrainte que CarteParcelles.tsx.
const CarteCouverture = dynamic(() => import("@/components/parcelles/CarteCouvertureLeaflet"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--color-menthe)", color: "var(--color-foret)", fontSize: "14px" }}>
      Chargement de la carte…
    </div>
  ),
});

// Centre par région pour la carte de couverture — dérivé des vraies
// parcelles CHARGÉES (moyenne lat/lng), jamais codé en dur. `centre` est
// null si la région n'a aucune parcelle dans l'échantillon (le bouton reste
// cliquable, la carte retombe alors sur la vue Maroc entière). Une
// approximation sur l'échantillon reste correcte ici : ce n'est qu'un point
// de recentrage visuel, pas un total affiché — contrairement au COMPTEUR
// (cf. `counts`/getStatsParRegion plus bas), qui doit lui porter sur tout
// le catalogue (bug corrigé le 2026-08-18 : la somme des compteurs par
// région, jusque-là calculée sur ce même échantillon de 50, ne pouvait
// jamais atteindre le vrai total dès que le catalogue dépassait 50 annonces).
function centresParRegion(parcelles: Parcelle[], regions: Region[]) {
  return regions.map((r) => {
    const avecCoords = parcelles.filter(
      (p) => p.parcelle.regionNom === r.nom && p.parcelle.latitude != null && p.parcelle.longitude != null
    );
    const centre: [number, number] | null = avecCoords.length
      ? [
          avecCoords.reduce((s, p) => s + (p.parcelle.latitude as number), 0) / avecCoords.length,
          avecCoords.reduce((s, p) => s + (p.parcelle.longitude as number), 0) / avecCoords.length,
        ]
      : null;
    return { code: r.code, nom: r.nom, centre };
  });
}

// Section "Valeur — couverture" de la Home — isolée en Client Component
// (interactivité : sélection de région, carte Leaflet) pour que le reste de
// la Home puisse rester un Server Component qui fetch les vraies annonces
// directement (cf. app/page.tsx). `parcelles` est le même échantillon
// (jusqu'à 50, cf. contrat §4.2) que celui déjà utilisé pour les vedettes ;
// `totalCount` est le vrai total serveur (peut dépasser 50).
export default function CouvertureSection({
  parcelles,
  totalCount,
}: {
  parcelles: Parcelle[];
  totalCount: number;
}) {
  const [regionCode, setRegionCode] = useState<string | null>(null);
  // Les 12 régions officielles, jamais une liste recopiée à la main (audit
  // P0-03) — même source que le filtre du catalogue (FiltresSidebar).
  const [regions, setRegions] = useState<Region[]>([]);
  useEffect(() => {
    getRegions()
      .then(setRegions)
      .catch(() => setRegions([]));
  }, []);

  // Compteurs réels (tout le catalogue, cf. getStatsParRegion) — jamais
  // dérivés de `parcelles` (échantillon de 50, cf. centresParRegion
  // ci-dessus pour le centre de carte, qui lui reste une approximation
  // acceptable sur ce même échantillon).
  const [counts, setCounts] = useState<StatRegion[]>([]);
  useEffect(() => {
    getStatsParRegion()
      .then(setCounts)
      .catch(() => setCounts([]));
  }, []);

  const centres = centresParRegion(parcelles, regions);
  const statsRegions = centres.map((c) => ({
    ...c,
    count: counts.find((s) => s.code === c.code)?.count ?? 0,
  }));
  const regionActive: RegionActive = regionCode
    ? centres.find((r) => r.code === regionCode) ?? null
    : null;

  return (
    <section style={{ maxWidth: "1400px", margin: "clamp(64px, 10vw, 120px) auto", padding: "0 24px" }}>
      <Reveal>
        <div style={{ maxWidth: "620px", marginBottom: "32px" }}>
          <span className="eyebrow">Couverture nationale</span>
          <h2 className="display-2" style={{ color: "var(--color-nuit)", margin: "14px 0 16px" }}>
            La terre n&apos;est jamais loin.
          </h2>
          <p className="lede" style={{ margin: 0 }}>
            Explorez les {totalCount} parcelles disponibles à travers le Maroc, région par région.
            Sélectionnez une zone pour recentrer la carte.
          </p>
        </div>
      </Reveal>

      <Reveal delayMs={80}>
        <div className="akal-couverture-grid" style={{ display: "grid", gridTemplateColumns: "minmax(240px, 300px) minmax(0, 1fr)", gap: "20px", alignItems: "stretch" }}>
          {/* Panneau régions — centres dérivés de centresParRegion, compteurs de
              getStatsParRegion (jamais codés en dur, ni l'un ni l'autre). */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setRegionCode(null)}
              aria-pressed={regionCode === null}
              className="akal-region-btn akal-focusable"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                textAlign: "left",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
                backgroundColor: regionCode === null ? "var(--color-foret)" : "white",
                color: regionCode === null ? "white" : "var(--color-texte)",
                border: regionCode === null ? "none" : "1px solid var(--color-bordure)",
              }}
            >
              <span>Tout le Maroc</span>
              <span
                style={{
                  minWidth: "24px",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-full)",
                  fontSize: "12px",
                  fontWeight: 600,
                  textAlign: "center",
                  backgroundColor: regionCode === null ? "rgba(255,255,255,0.2)" : "var(--color-rosee)",
                  color: regionCode === null ? "white" : "var(--color-foret)",
                }}
              >
                {totalCount}
              </span>
            </button>

            {statsRegions.map((r) => {
              const active = regionCode === r.code;
              return (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => setRegionCode(active ? null : r.code)}
                  aria-pressed={active}
                  className="akal-region-btn akal-focusable"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    padding: "12px 16px",
                    borderRadius: "var(--radius-md)",
                    textAlign: "left",
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: "pointer",
                    backgroundColor: active ? "var(--color-foret)" : "white",
                    color: active ? "white" : "var(--color-texte)",
                    border: active ? "none" : "1px solid var(--color-bordure)",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <MapPin size={14} style={{ color: active ? "var(--color-ble)" : "var(--color-foret)", opacity: active ? 1 : 0.6, flexShrink: 0 }} />
                    {r.nom}
                  </span>
                  <span
                    style={{
                      minWidth: "24px",
                      padding: "2px 8px",
                      borderRadius: "var(--radius-full)",
                      fontSize: "12px",
                      fontWeight: 600,
                      textAlign: "center",
                      backgroundColor: active ? "rgba(255,255,255,0.2)" : "var(--color-rosee)",
                      color: active ? "white" : "var(--color-foret)",
                    }}
                  >
                    {r.count}
                  </span>
                </button>
              );
            })}

            {/* Même route que le lien "Carte" du Navbar (/parcelles?vue=carte,
                cf. app/parcelles/page.tsx) — ouvre directement en vue carte
                plutôt qu'en grille, cohérent avec "Voir la carte complète". */}
            <Link href="/parcelles?vue=carte" className="akal-link-fleche" style={{ marginTop: "8px" }}>
              Voir la carte complète →
            </Link>
          </div>

          {/* Carte */}
          <div
            style={{
              position: "relative",
              height: "480px",
              borderRadius: "var(--radius-xl)",
              overflow: "hidden",
              boxShadow: "var(--shadow-2)",
            }}
          >
            <CarteCouverture
              parcelles={parcelles}
              regions={regions}
              regionActive={regionActive}
              onSelectionnerRegion={(code) => setRegionCode((actuel) => (actuel === code ? null : code))}
            />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
