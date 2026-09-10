"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  FILTRES_INITIAUX,
  filtresActifs,
  filtresVersParams,
  getParcelles,
  getRegions,
  type BboxCarte,
  type FiltresState,
  type ParcellesPage,
  type Region,
  type Tri,
} from "@/data/parcelles";
import { fetchCommuneGeomDetail, fetchProvinceGeomBounds } from "@/lib/geo-api";
import type { RegionActive } from "@/components/parcelles/CarteRegions";
import FiltresSidebar from "@/components/parcelles/FiltresSidebar";
import TiroirResultats from "@/components/parcelles/carte/TiroirResultats";
import FicheContactFlottante from "@/components/parcelles/carte/FicheContactFlottante";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ChevronLeft, Filter } from "@/components/icons/Icons";

// Chargement client uniquement — Leaflet touche `window` (même contrainte
// que CarteParcelles.tsx).
const CarteLeaflet = dynamic(() => import("@/components/parcelles/CarteLeaflet"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--color-menthe)",
        color: "var(--color-foret)",
        fontSize: "14px",
      }}
    >
      Chargement de la carte…
    </div>
  ),
});

// 50 = max_page_size côté backend (annonces/api_views.py) — même limite que
// la vue carte du catalogue et la carte de couverture de la Home.
const TAILLE_CARTE = 50;
// Tri figé « plus récentes » au niveau de la requête ; le tri visible du
// tiroir est géographique (distance au centre de la carte, calculé côté
// client, cf. resultatsTries plus bas — design 1c).
const TRI_CARTE: Tri = "recent";

// ── URL ↔ filtres (carte plein écran partageable) ──────────────────────────
function lireFiltres(sp: URLSearchParams): FiltresState {
  return {
    recherche: sp.get("q") ?? "",
    region: sp.get("region") ?? "",
    province: sp.get("province") ?? "",
    commune: sp.get("commune") ?? "",
    statutFoncier: (sp.get("statut_foncier") as FiltresState["statutFoncier"]) ?? "",
    eau: (sp.get("eau") as FiltresState["eau"]) ?? "tous",
    prixMin: sp.has("prix_min") ? Number(sp.get("prix_min")) : null,
    prixMax: sp.has("prix_max") ? Number(sp.get("prix_max")) : null,
    surfaceMin: sp.has("surface_min") ? Number(sp.get("surface_min")) : null,
    surfaceMax: sp.has("surface_max") ? Number(sp.get("surface_max")) : null,
  };
}

function versUrl(f: FiltresState): string {
  const sp = new URLSearchParams();
  if (f.recherche) sp.set("q", f.recherche);
  if (f.region) sp.set("region", f.region);
  if (f.province) sp.set("province", f.province);
  if (f.commune) sp.set("commune", f.commune);
  if (f.statutFoncier) sp.set("statut_foncier", f.statutFoncier);
  if (f.eau !== "tous") sp.set("eau", f.eau);
  if (f.prixMin != null) sp.set("prix_min", String(f.prixMin));
  if (f.prixMax != null) sp.set("prix_max", String(f.prixMax));
  if (f.surfaceMin != null) sp.set("surface_min", String(f.surfaceMin));
  if (f.surfaceMax != null) sp.set("surface_max", String(f.surfaceMax));
  const qs = sp.toString();
  return qs ? `/carte?${qs}` : "/carte";
}

// Distance² euclidienne en degrés — approximation suffisante pour ordonner un
// tiroir d'au plus 50 éléments, pas pour un calcul métrique.
function distance2(c: { lat: number; lng: number }, p: { latitude: number; longitude: number }): number {
  const dLat = c.lat - p.latitude;
  const dLng = c.lng - p.longitude;
  return dLat * dLat + dLng * dLng;
}

const pilule: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "10px 16px",
  borderRadius: "var(--radius-full)",
  backgroundColor: "white",
  color: "var(--color-texte)",
  fontSize: "13px",
  fontWeight: 500,
  textDecoration: "none",
  boxShadow: "var(--shadow-2)",
  border: "none",
};

// Carte plein écran (design 1c) — la carte EST la navigation : elle occupe
// tout le viewport sous la Navbar, les résultats sont un tiroir rétractable
// à gauche, la mise en relation se fait via la fiche de contact flottante,
// et les filtres (mêmes que le catalogue) s'ouvrent en panneau hors-champ.
function CartePleinEcran() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Lu une seule fois au montage ; les changements ultérieurs sont ceux que
  // cette page écrit elle-même (cf. effet de synchro URL plus bas).
  const initial = useMemo(() => lireFiltres(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [filtres, setFiltres] = useState<FiltresState>(initial);
  // "Rechercher cette zone" (CarteLeaflet.tsx) — action ponctuelle, hors
  // FiltresState/URL comme dans le catalogue ; effacée dès qu'un filtre change.
  const [bbox, setBbox] = useState<BboxCarte | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [donnees, setDonnees] = useState<ParcellesPage | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtresOuverts, setFiltresOuverts] = useState(false);

  // Sélection : source unique dont dérivent le repère actif, la carte du
  // tiroir et la fiche de contact (design 1c — « ne pas dupliquer l'état par
  // calque »). `parcelleChoisie` = le choix explicite de l'utilisateur ;
  // `parcelleActiveId` (dérivé, plus bas) retombe sur la 1re annonce du lot
  // si ce choix n'y est plus — sans effet de synchro (react-hooks).
  const [parcelleChoisie, setParcelleChoisie] = useState<string | null>(null);
  // Objet neuf à chaque sélection DEPUIS LE TIROIR → la carte vole vers la
  // parcelle. Un clic sur un repère ne le met pas à jour (pas de recadrage).
  const [volVersParcelle, setVolVersParcelle] = useState<{ lat: number; lng: number } | null>(null);
  const [centreCarte, setCentreCarte] = useState<{ lat: number; lng: number } | null>(null);

  const estMobile = useMediaQuery("(max-width: 768px)");
  const [tiroirOuvert, setTiroirOuvert] = useState(true);
  // Sur mobile le tiroir démarre replié pour ne pas masquer la carte.
  // setState différé d'un micro-tick — même convention que le reste du
  // fichier (react-hooks/set-state-in-effect).
  useEffect(() => {
    let annule = false;
    Promise.resolve().then(() => {
      if (!annule) setTiroirOuvert(!estMobile);
    });
    return () => {
      annule = true;
    };
  }, [estMobile]);

  useEffect(() => {
    getRegions()
      .then(setRegions)
      .catch(() => setRegions([]));
  }, []);

  useEffect(() => {
    let annule = false;
    // setChargement/setErreur différés d'un micro-tick — même convention que
    // app/parcelles/page.tsx (react-hooks/set-state-in-effect).
    Promise.resolve()
      .then(() => {
        if (annule) return undefined;
        setChargement(true);
        setErreur(null);
        return getParcelles(filtresVersParams(filtres, TRI_CARTE, 1, TAILLE_CARTE, bbox));
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
  }, [filtres, bbox]);

  // URL partageable — navigation sans rechargement (router.replace shallow).
  useEffect(() => {
    router.replace(versUrl(filtres), { scroll: false });
  }, [filtres, router]);

  const resultats = useMemo(() => donnees?.results ?? [], [donnees]);

  // Dérivé (pas d'effet de synchro) : la parcelle active est le choix
  // explicite s'il est encore dans le lot, sinon la première — la fiche de
  // contact n'est donc jamais vide (design 1c).
  const parcelleActiveId = useMemo(
    () =>
      parcelleChoisie && resultats.some((p) => p.id === parcelleChoisie)
        ? parcelleChoisie
        : resultats[0]?.id ?? null,
    [parcelleChoisie, resultats],
  );

  // Tiroir trié par distance au centre courant de la carte (design 1c —
  // « triés par distance au centre »).
  const resultatsTries = useMemo(() => {
    if (!centreCarte) return resultats;
    return [...resultats].sort(
      (a, b) => distance2(centreCarte, a.parcelle) - distance2(centreCarte, b.parcelle),
    );
  }, [resultats, centreCarte]);

  const parcelleActive = useMemo(
    () => resultats.find((p) => p.id === parcelleActiveId) ?? null,
    [resultats, parcelleActiveId],
  );

  // Centre dérivé des parcelles réelles de la région (jamais un centroïde
  // inventé côté front — même principe que app/parcelles/page.tsx).
  const regionActive: RegionActive = useMemo(() => {
    if (!filtres.region) return null;
    const r = regions.find((rg) => rg.code === filtres.region);
    if (!r) return null;
    const centre: [number, number] | null = resultats.length
      ? [
          resultats.reduce((s, p) => s + p.parcelle.latitude, 0) / resultats.length,
          resultats.reduce((s, p) => s + p.parcelle.longitude, 0) / resultats.length,
        ]
      : null;
    return { code: r.code, nom: r.nom, centre };
  }, [filtres.region, regions, resultats]);

  // Cadrage cascade région/province/commune (cf. app/parcelles/page.tsx).
  const [zoneGeometrie, setZoneGeometrie] = useState<unknown | null>(null);
  useEffect(() => {
    let annule = false;
    if (filtres.commune) {
      fetchCommuneGeomDetail(Number(filtres.commune))
        .then((c) => {
          if (!annule) setZoneGeometrie(c.geometry ?? null);
        })
        .catch(() => {
          if (!annule) setZoneGeometrie(null);
        });
    } else if (filtres.province && filtres.region) {
      fetchProvinceGeomBounds(filtres.region, Number(filtres.province))
        .then((geom) => {
          if (!annule) setZoneGeometrie(geom);
        })
        .catch(() => {
          if (!annule) setZoneGeometrie(null);
        });
    } else {
      Promise.resolve().then(() => {
        if (!annule) setZoneGeometrie(null);
      });
    }
    return () => {
      annule = true;
    };
  }, [filtres.commune, filtres.province, filtres.region]);

  const patchFiltres = useCallback((patch: Partial<FiltresState>) => {
    setFiltres((prev) => ({ ...prev, ...patch }));
    setBbox(null);
  }, []);

  const reinitialiser = useCallback(() => {
    setFiltres(FILTRES_INITIAUX);
    setBbox(null);
  }, []);

  const rechercherZone = useCallback((zone: BboxCarte) => {
    setFiltres((f) => ({ ...f, region: "", province: "", commune: "" }));
    setBbox(zone);
  }, []);

  const onCentreCarte = useCallback((c: { lat: number; lng: number }) => setCentreCarte(c), []);

  // Sélection depuis le tiroir → sélectionne ET fait voler la carte.
  const selectionnerDepuisTiroir = useCallback(
    (id: string) => {
      setParcelleChoisie(id);
      const p = resultats.find((r) => r.id === id);
      if (p) setVolVersParcelle({ lat: p.parcelle.latitude, lng: p.parcelle.longitude });
    },
    [resultats],
  );

  const total = donnees?.count ?? 0;
  const compteAffiche = donnees ? Math.min(resultats.length, total) : 0;

  return (
    <div style={{ height: "calc(100dvh - 64px)", width: "100%", position: "relative", overflow: "hidden" }}>
      <FiltresSidebar
        flottante
        ouverte={filtresOuverts}
        onFermer={() => setFiltresOuverts(false)}
        filtres={filtres}
        onChange={patchFiltres}
        onReinitialiser={reinitialiser}
        regions={regions}
        onAppliquer={() => setFiltresOuverts(false)}
      />

      {/* Barre flottante haut-gauche — retour catalogue, filtres, compteur. */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
          maxWidth: "calc(100% - 32px)",
        }}
      >
        <Link href="/parcelles" className="akal-focusable" style={pilule}>
          <ChevronLeft size={16} /> Explorer
        </Link>
        <button
          type="button"
          onClick={() => setFiltresOuverts(true)}
          className="akal-focusable"
          style={{
            ...pilule,
            cursor: "pointer",
            ...(filtresActifs(filtres) ? { backgroundColor: "var(--color-foret)", color: "white" } : {}),
          }}
        >
          <Filter size={15} /> Filtres
        </button>
        {!erreur && donnees && (
          <span style={{ ...pilule, color: "var(--color-secondaire)", cursor: "default" }}>
            {regionActive ? `${regionActive.nom} — ` : ""}
            <strong style={{ color: "var(--color-texte)", margin: "0 3px" }}>{compteAffiche}</strong>
            {total > resultats.length ? `sur ${total} ` : ""}
            annonce{total > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {erreur ? (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "12px",
            padding: "20px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "15px", color: "var(--color-terre-texte)" }}>{erreur}</p>
          <button type="button" className="btn-secondary" onClick={() => setFiltres((f) => ({ ...f }))}>
            Réessayer
          </button>
        </div>
      ) : (
        <>
          <CarteLeaflet
            parcelles={resultats}
            regions={regions}
            regionActive={regionActive}
            onSelectionnerRegion={(code) =>
              patchFiltres({ region: filtres.region === code ? "" : code, province: "", commune: "" })
            }
            onRechercherZone={rechercherZone}
            zoneGeometrie={zoneGeometrie}
            parcelleActiveId={parcelleActiveId}
            onSelectionnerParcelle={setParcelleChoisie}
            onCentreCarte={onCentreCarte}
            volVersParcelle={volVersParcelle}
          />

          <TiroirResultats
            parcelles={resultatsTries}
            total={total}
            chargement={chargement}
            parcelleActiveId={parcelleActiveId}
            onSelectionner={selectionnerDepuisTiroir}
            ouvert={tiroirOuvert}
            onToggle={() => setTiroirOuvert((v) => !v)}
            estMobile={estMobile}
          />

          <FicheContactFlottante parcelle={parcelleActive} estMobile={estMobile} />
        </>
      )}
    </div>
  );
}

export default function CartePage() {
  // useSearchParams() doit être encapsulé dans un <Suspense> pour le build de
  // production (même contrainte que app/parcelles/page.tsx).
  return (
    <Suspense fallback={null}>
      <CartePleinEcran />
    </Suspense>
  );
}
