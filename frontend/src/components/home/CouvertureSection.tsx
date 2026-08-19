"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronRight, MapPin } from "@/components/icons/Icons";
import { Reveal } from "@/components/Reveal";
import type { Parcelle } from "@/types/parcelle";
import { getParcelles, getRegions, getStatsParRegion, type Region, type StatRegion } from "@/data/parcelles";
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
  // Survol du panneau de gauche (audit desktop du 19/08) — distinct de
  // `regionCode` (la vraie sélection, par clic) : purement visuel, illumine
  // le polygone correspondant sur la carte le temps du survol sans changer
  // les parcelles affichées ni le filtre actif.
  const [regionSurvolee, setRegionSurvolee] = useState<string | null>(null);
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

  // Parcelles réelles de la région sélectionnée (jusqu'à 50, même limite
  // que TAILLE_CARTE côté catalogue) — bug du 18/08 : la carte filtrait
  // jusque-là `parcelles` (l'échantillon générique des 50 plus récentes,
  // toutes régions confondues), qui ne contient quasiment jamais toutes les
  // annonces réelles d'une région donnée. Le compteur affiché (getStatsParRegion
  // ci-dessus) est déjà correct depuis le précédent correctif ; la carte, elle,
  // montrait donc nettement moins de pins que ce chiffre. `null` = pas encore
  // chargé (aucune région sélectionnée, ou requête en cours).
  const [parcellesRegion, setParcellesRegion] = useState<Parcelle[] | null>(null);
  useEffect(() => {
    let annule = false;
    if (!regionCode) {
      // Différé d'un micro-tick — même convention qu'ailleurs dans le
      // projet (ex. app/parcelles/page.tsx) : un setState synchrone en tête
      // d'effet déclenche un rendu en cascade avant même que React n'ait
      // fini de committer celui-ci (react-hooks/set-state-in-effect).
      Promise.resolve().then(() => {
        if (!annule) setParcellesRegion(null);
      });
      return () => {
        annule = true;
      };
    }
    getParcelles({ region: regionCode, page_size: 50 })
      .then((res) => {
        if (!annule) setParcellesRegion(res.results);
      })
      .catch(() => {
        if (!annule) setParcellesRegion([]);
      });
    return () => {
      annule = true;
    };
  }, [regionCode]);

  // Parcelles réellement passées à la carte : l'échantillon générique pour
  // "Tout le Maroc", les vraies parcelles de la région le temps qu'elles
  // chargent sinon (jamais un mélange des deux, pour ne pas laisser
  // apparaître un instant des pins hors-région).
  const parcellesCarte = regionCode ? (parcellesRegion ?? []) : parcelles;

  // Centres approximatifs (échantillon générique, cf. centresParRegion) —
  // toujours utilisés pour `nom`/`code` de chaque région et comme repli tant
  // que `parcellesRegion` n'a pas chargé. Une fois chargée, le centre de la
  // région ACTIVE est affiné avec ses vraies parcelles (moyenne plus fidèle
  // qu'une approximation sur l'échantillon générique, qui peut n'en
  // contenir que très peu, voire aucune, pour une région donnée).
  const centresApprox = centresParRegion(parcelles, regions);
  const statsRegions = centresApprox.map((c) => ({
    ...c,
    count: counts.find((s) => s.code === c.code)?.count ?? 0,
  }));
  const centreActifAffine: [number, number] | null = useMemo(() => {
    if (!parcellesRegion || parcellesRegion.length === 0) return null;
    return [
      parcellesRegion.reduce((s, p) => s + p.parcelle.latitude, 0) / parcellesRegion.length,
      parcellesRegion.reduce((s, p) => s + p.parcelle.longitude, 0) / parcellesRegion.length,
    ];
  }, [parcellesRegion]);
  const regionActive: RegionActive = regionCode
    ? (() => {
        const approx = centresApprox.find((r) => r.code === regionCode);
        if (!approx) return null;
        return { ...approx, centre: centreActifAffine ?? approx.centre };
      })()
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
              getStatsParRegion (jamais codés en dur, ni l'un ni l'autre).
              Carte blanche englobante (audit desktop du 19/08) — même
              radius/ombre que le conteneur de la carte ci-dessous, pour que
              les deux blocs se lisent comme une seule unité plutôt qu'une
              liste flottant à côté d'une carte, sur le fond beige de la
              section. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              backgroundColor: "white",
              borderRadius: "var(--radius-xl)",
              boxShadow: "var(--shadow-2)",
              padding: "16px",
            }}
          >
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
              const survolee = !active && regionSurvolee === r.code;
              return (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => setRegionCode(active ? null : r.code)}
                  onMouseEnter={() => setRegionSurvolee(r.code)}
                  onMouseLeave={() => setRegionSurvolee((v) => (v === r.code ? null : v))}
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
                    backgroundColor: active ? "var(--color-foret)" : survolee ? "var(--color-rosee)" : "white",
                    color: active ? "white" : "var(--color-texte)",
                    border: active ? "none" : "1px solid var(--color-bordure)",
                    transition: "background-color 150ms ease",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <MapPin size={14} style={{ color: active ? "var(--color-ble)" : "var(--color-foret)", opacity: active ? 1 : 0.6, flexShrink: 0 }} />
                    {r.nom}
                  </span>
                  {/* Compteur + chevron groupés à droite (audit desktop du
                      19/08) — le chevron signale explicitement que la ligne
                      est cliquable (filtre la carte + le catalogue), pas
                      qu'un simple affichage de compteur. */}
                  <span style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
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
                    <ChevronRight
                      size={15}
                      style={{ color: active ? "white" : "var(--color-secondaire)", opacity: active || survolee ? 1 : 0.45, transition: "opacity 150ms ease" }}
                    />
                  </span>
                </button>
              );
            })}

            {/* Même route que le lien "Carte" du Navbar (/carte, refonte nav
                du 19/08 — vue plein écran dédiée, cf. app/carte/page.tsx). */}
            <Link href="/carte" className="akal-link-fleche" style={{ marginTop: "8px" }}>
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
              parcelles={parcellesCarte}
              regions={regions}
              regionActive={regionActive}
              regionSurvolee={regionSurvolee}
              onSelectionnerRegion={(code) => setRegionCode((actuel) => (actuel === code ? null : code))}
            />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
