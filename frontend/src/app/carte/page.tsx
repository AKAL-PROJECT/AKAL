"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  getParcelles,
  getRegions,
  type BboxCarte,
  type ParcellesPage,
  type Region,
} from "@/data/parcelles";
import type { RegionActive } from "@/components/parcelles/CarteRegions";
import { ChevronLeft } from "@/components/icons/Icons";

// Chargement client uniquement — Leaflet touche `window` (même contrainte
// que CarteParcelles.tsx). Importé directement (pas via CarteParcelles) :
// ce composant impose une hauteur fixe de 500px + bordure/ombre pensées
// pour une carte encastrée dans le catalogue, pas pour cette page plein
// écran (edge-to-edge, cf. mise en page ci-dessous).
const CarteLeaflet = dynamic(() => import("@/components/parcelles/CarteLeaflet"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--color-menthe)", color: "var(--color-foret)", fontSize: "14px" }}>
      Chargement de la carte…
    </div>
  ),
});

// Même limite que la vue carte du catalogue (TAILLE_CARTE, app/parcelles/page.tsx)
// et que la carte de couverture de la Home — 50 = max_page_size côté
// backend (annonces/api_views.py), au-delà seules les plus récentes
// apparaissent pour un même filtre.
const TAILLE_CARTE = 50;

// Vue carte plein écran dédiée (19/08) — remplace, pour la navigation
// principale, le renvoi vers /parcelles?vue=carte (toggle interne du
// catalogue, toujours présent et inchangé par ailleurs) : pas de sidebar de
// filtres ici, la carte occupe tout le viewport sous la Navbar. Sélection
// de région et "Rechercher cette zone" restent les deux seules façons de
// restreindre la recherche, directement sur la carte (cf. CarteLeaflet.tsx)
// — volontairement pas de filtres avancés (prix/surface/statut foncier...),
// qui restent le rôle du catalogue (/parcelles).
function CartePleinEcran() {
  const searchParams = useSearchParams();
  // Lu une seule fois au montage — un lien externe (ex. Navbar, Footer)
  // peut présélectionner une région ; les changements ultérieurs sont émis
  // par cette page elle-même (cf. useEffect de synchro URL plus bas), même
  // convention que app/parcelles/page.tsx.
  const regionInitiale = useMemo(() => searchParams.get("region") ?? "", []); // eslint-disable-line react-hooks/exhaustive-deps

  const [regionCode, setRegionCode] = useState(regionInitiale);
  // "Rechercher cette zone" (CarteLeaflet.tsx) — effacée dès qu'une région
  // est sélectionnée autrement, même principe que app/parcelles/page.tsx
  // (les deux façons de restreindre la recherche ne se cumulent pas).
  const [bbox, setBbox] = useState<BboxCarte | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [donnees, setDonnees] = useState<ParcellesPage | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getRegions()
      .then(setRegions)
      .catch(() => setRegions([]));
  }, []);

  useEffect(() => {
    let annule = false;
    // setChargement/setErreur différés d'un micro-tick — même convention
    // que app/parcelles/page.tsx (react-hooks/set-state-in-effect).
    Promise.resolve()
      .then(() => {
        if (annule) return undefined;
        setChargement(true);
        setErreur(null);
        return getParcelles({
          region: regionCode || undefined,
          page_size: TAILLE_CARTE,
          ordering: "-date_publication",
          lat_min: bbox?.latMin,
          lat_max: bbox?.latMax,
          lng_min: bbox?.lngMin,
          lng_max: bbox?.lngMax,
        });
      })
      .then((res) => {
        if (!annule && res) setDonnees(res);
      })
      .catch((err) => {
        if (!annule) setErreur(err instanceof Error ? err.message : "Erreur de chargement de la carte.");
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, [regionCode, bbox]);

  const resultats = useMemo(() => donnees?.results ?? [], [donnees]);

  // Centre dérivé des vraies parcelles chargées (même principe que
  // regionActive dans app/parcelles/page.tsx — jamais un centroïde inventé
  // côté front) : `resultats` est déjà filtré par région côté serveur
  // (filtres.region envoyé à l'API) une fois une région sélectionnée.
  const regionActive: RegionActive = useMemo(() => {
    if (!regionCode) return null;
    const r = regions.find((rg) => rg.code === regionCode);
    if (!r) return null;
    const centre: [number, number] | null = resultats.length
      ? [
          resultats.reduce((s, p) => s + p.parcelle.latitude, 0) / resultats.length,
          resultats.reduce((s, p) => s + p.parcelle.longitude, 0) / resultats.length,
        ]
      : null;
    return { code: r.code, nom: r.nom, centre };
  }, [regionCode, regions, resultats]);

  const selectionnerRegion = (code: string) => {
    setBbox(null);
    setRegionCode((actuel) => (actuel === code ? "" : code));
  };

  return (
    <div style={{ height: "calc(100vh - 64px)", width: "100%", position: "relative" }}>
      {/* Barre flottante minimaliste — pas de sidebar de filtres sur cette
          page (rôle du catalogue) : juste un retour vers Explorer et le
          compte de résultats. */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <Link
          href="/parcelles"
          className="akal-focusable"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "10px 16px",
            borderRadius: "var(--radius-full)",
            backgroundColor: "white",
            color: "var(--color-texte)",
            fontSize: "14px",
            fontWeight: 500,
            textDecoration: "none",
            boxShadow: "var(--shadow-2)",
          }}
        >
          <ChevronLeft size={16} /> Explorer
        </Link>
        {!erreur && !chargement && donnees && (
          <span
            style={{
              padding: "10px 16px",
              borderRadius: "var(--radius-full)",
              backgroundColor: "white",
              color: "var(--color-secondaire)",
              fontSize: "13px",
              fontWeight: 500,
              boxShadow: "var(--shadow-2)",
            }}
          >
            {regionActive ? `${regionActive.nom} — ` : ""}
            <strong style={{ color: "var(--color-texte)" }}>{Math.min(resultats.length, donnees.count)}</strong>
            {donnees.count > resultats.length ? ` sur ${donnees.count}` : ""} annonce{donnees.count > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {erreur ? (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px", padding: "20px", textAlign: "center" }}>
          <p style={{ fontSize: "15px", color: "var(--color-terre-texte)" }}>{erreur}</p>
          <button type="button" className="btn-secondary" onClick={() => setRegionCode((r) => r)}>
            Réessayer
          </button>
        </div>
      ) : (
        <CarteLeaflet
          parcelles={resultats}
          regions={regions}
          regionActive={regionActive}
          onSelectionnerRegion={selectionnerRegion}
          onRechercherZone={(zone) => {
            setRegionCode("");
            setBbox(zone);
          }}
        />
      )}
    </div>
  );
}

export default function CartePage() {
  // useSearchParams() doit être encapsulé dans un <Suspense> pour le build
  // de production (même contrainte que app/parcelles/page.tsx).
  return (
    <Suspense fallback={null}>
      <CartePleinEcran />
    </Suspense>
  );
}
