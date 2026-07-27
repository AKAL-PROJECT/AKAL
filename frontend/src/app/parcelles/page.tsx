"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FILTRES_INITIAUX,
  filtresActifs,
  filtresVersParams,
  filtrerRecherche,
  getParcelles,
  getParcellesPage,
  getRegions,
  type FiltresState,
  type ParcellesPage,
  type Region,
  type Tri,
} from "@/data/parcelles";
import CardParcelle from "@/components/parcelles/CardParcelle";
import CardParcelleSkeleton from "@/components/parcelles/CardParcelleSkeleton";
import FiltresSidebar from "@/components/parcelles/FiltresSidebar";
import BarreComparateur from "@/components/parcelles/BarreComparateur";
import CarteParcelles from "@/components/parcelles/CarteParcelles";
import { Grid, Map, Filter, MountainEmpty } from "@/components/icons/Icons";

// Auto-fill avec un seuil de 300px : ≈3 colonnes sur un desktop courant
// (sidebar + gap déduits), 1 colonne sous ~620px — équivalent explicite au
// gabarit "3 col desktop / 1 col mobile" du prototype, sans dupliquer de
// media query dans globals.css (hors périmètre de cet agent).
const GRILLE_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
  gap: "16px",
};

type ModeAffichage = "grille" | "carte";
const PAGE_SIZE = 12;
const NB_SKELETONS = 8;

// ── URL ↔ état (persistance des filtres, §M-3 : "URL partageable") ──────────
function lireDepuisUrl(sp: URLSearchParams): { filtres: FiltresState; tri: Tri; page: number } {
  return {
    filtres: {
      recherche: sp.get("q") ?? "",
      region: sp.get("region") ?? "",
      statutFoncier: (sp.get("statut_foncier") as FiltresState["statutFoncier"]) ?? "",
      eau: (sp.get("eau") as FiltresState["eau"]) ?? "tous",
      prixMin: sp.has("prix_min") ? Number(sp.get("prix_min")) : null,
      prixMax: sp.has("prix_max") ? Number(sp.get("prix_max")) : null,
      surfaceMin: sp.has("surface_min") ? Number(sp.get("surface_min")) : null,
      surfaceMax: sp.has("surface_max") ? Number(sp.get("surface_max")) : null,
    },
    tri: (sp.get("tri") as Tri) ?? "recent",
    page: sp.has("page") ? Math.max(1, Number(sp.get("page")) || 1) : 1,
  };
}

function versUrl(filtres: FiltresState, tri: Tri, page: number): string {
  const sp = new URLSearchParams();
  if (filtres.recherche) sp.set("q", filtres.recherche);
  if (filtres.region) sp.set("region", filtres.region);
  if (filtres.statutFoncier) sp.set("statut_foncier", filtres.statutFoncier);
  if (filtres.eau !== "tous") sp.set("eau", filtres.eau);
  if (filtres.prixMin != null) sp.set("prix_min", String(filtres.prixMin));
  if (filtres.prixMax != null) sp.set("prix_max", String(filtres.prixMax));
  if (filtres.surfaceMin != null) sp.set("surface_min", String(filtres.surfaceMin));
  if (filtres.surfaceMax != null) sp.set("surface_max", String(filtres.surfaceMax));
  if (tri !== "recent") sp.set("tri", tri);
  if (page !== 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `/parcelles?${qs}` : "/parcelles";
}

// `useSearchParams` doit être encapsulé dans un <Suspense> pour le build de
// production (voir doc Next.js — sinon échec avec "missing-suspense-with-csr-bailout").
export default function CataloguePage() {
  return (
    <Suspense fallback={null}>
      <Catalogue />
    </Suspense>
  );
}

function Catalogue() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Lu une seule fois au montage : les changements ultérieurs de l'URL sont
  // ceux que CE composant écrit lui-même (voir l'effet de synchronisation plus bas).
  const initial = useMemo(() => lireDepuisUrl(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [mode, setMode] = useState<ModeAffichage>("grille");
  const [tri, setTri] = useState<Tri>(initial.tri);
  const [page, setPage] = useState(initial.page);
  const [filtres, setFiltres] = useState<FiltresState>(initial.filtres);
  const [sidebarOuverte, setSidebarOuverte] = useState(false);
  const [comparaison, setComparaison] = useState<string[]>([]);

  const [regions, setRegions] = useState<Region[]>([]);
  const [donnees, setDonnees] = useState<ParcellesPage | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // Régions du filtre — chargées une fois (référentiel non paginé, §4.1).
  useEffect(() => {
    getRegions()
      .then(setRegions)
      .catch(() => setRegions([]));
  }, []);

  // Annonces — rechargées à chaque changement de filtres/tri/page. Toujours
  // piloté par les query params du contrat (§4.2), jamais par les URLs
  // next/previous ici (celles-ci ne servent qu'à la pagination Précédent/Suivant,
  // cf. allerPage ci-dessous — pas de recalcul de page, §4.3).
  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreur(null);

    getParcelles(filtresVersParams(filtres, tri, page, PAGE_SIZE))
      .then((res) => {
        if (!annule) setDonnees(res);
      })
      .catch((err) => {
        if (!annule) setErreur(err instanceof Error ? err.message : "Erreur de chargement du catalogue.");
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });

    return () => {
      annule = true;
    };
  }, [filtres, tri, page]);

  // URL partageable — navigation sans rechargement complet (router.replace shallow).
  useEffect(() => {
    router.replace(versUrl(filtres, tri, page), { scroll: false });
  }, [filtres, tri, page, router]);

  const patchFiltres = useCallback((patch: Partial<FiltresState>) => {
    setFiltres((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  const reinitialiser = useCallback(() => {
    setFiltres(FILTRES_INITIAUX);
    setPage(1);
  }, []);

  // Pagination : consomme directement `next`/`previous` (URLs absolues) —
  // aucun recalcul de numéro de page côté front (contrat §4.3).
  const allerPage = (url: string | null | undefined, direction: 1 | -1) => {
    if (!url) return;
    setChargement(true);
    setErreur(null);
    getParcellesPage(url)
      .then((res) => {
        setDonnees(res);
        setPage((p) => p + direction);
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch((err) => setErreur(err instanceof Error ? err.message : "Erreur de chargement."))
      .finally(() => setChargement(false));
  };

  const resultats = donnees?.results ?? [];
  // Recherche texte : filtre côté client, limité à la page actuellement
  // chargée — voir le commentaire sur FiltresState.recherche (data/parcelles.ts).
  const resultatsAffiches = filtrerRecherche(resultats, filtres.recherche);

  const toggleComparaison = (id: string) => {
    setComparaison((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev,
    );
  };
  const parcellesComparees = resultats.filter((p) => comparaison.includes(p.id));

  return (
    <div className="catalogue" style={{ display: "flex", minHeight: "calc(100vh - 64px)", backgroundColor: "var(--color-fond)" }}>
      <FiltresSidebar
        ouverte={sidebarOuverte}
        onFermer={() => setSidebarOuverte(false)}
        filtres={filtres}
        onChange={patchFiltres}
        onReinitialiser={reinitialiser}
        regions={regions}
        onAppliquer={() => setSidebarOuverte(false)}
      />

      {/* Zone principale */}
      <main style={{ flex: 1, minWidth: 0, padding: "20px", paddingBottom: comparaison.length > 0 ? "96px" : "20px" }}>
        {/* Barre de contrôle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              type="button"
              onClick={() => setSidebarOuverte(true)}
              className="hidden-desktop btn-toggle-filtres"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "14px",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid var(--color-bordure)",
                backgroundColor: "white",
                cursor: "pointer",
                color: "var(--color-texte)",
              }}
            >
              <Filter size={14} /> Filtres
            </button>
            <span aria-live="polite" style={{ fontSize: "14px", color: "var(--color-secondaire)" }}>
              <strong style={{ color: "var(--color-texte)" }}>{resultatsAffiches.length}</strong>{" "}
              {resultatsAffiches.length <= 1 ? "annonce affichée" : "annonces affichées"}
              {donnees && donnees.count > donnees.results.length && (
                <> sur <strong style={{ color: "var(--color-texte)" }}>{donnees.count}</strong> au total</>
              )}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <select
              value={tri}
              onChange={(e) => { setTri(e.target.value as Tri); setPage(1); }}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "14px",
                border: "1px solid var(--color-bordure)",
                backgroundColor: "white",
                cursor: "pointer",
              }}
            >
              <option value="recent">Plus récentes</option>
              <option value="prix_asc">Prix croissant</option>
              <option value="prix_desc">Prix décroissant</option>
              <option value="surface">Superficie</option>
            </select>

            {/* Toggle grille / carte */}
            <div style={{ display: "flex", borderRadius: "8px", border: "1px solid var(--color-bordure)", overflow: "hidden" }}>
              <button
                type="button"
                onClick={() => setMode("grille")}
                aria-pressed={mode === "grille"}
                aria-label="Vue grille"
                style={{ padding: "8px 12px", border: "none", cursor: "pointer", display: "flex", backgroundColor: mode === "grille" ? "var(--color-rosee)" : "white" }}
              >
                <Grid size={15} style={{ color: mode === "grille" ? "var(--color-foret)" : "var(--color-tertiaire)" }} />
              </button>
              <button
                type="button"
                onClick={() => setMode("carte")}
                aria-pressed={mode === "carte"}
                aria-label="Vue carte"
                style={{ padding: "8px 12px", border: "none", borderLeft: "1px solid var(--color-bordure)", cursor: "pointer", display: "flex", backgroundColor: mode === "carte" ? "var(--color-rosee)" : "white" }}
              >
                <Map size={15} style={{ color: mode === "carte" ? "var(--color-foret)" : "var(--color-tertiaire)" }} />
              </button>
            </div>
          </div>
        </div>

        {/* Contenu */}
        {erreur ? (
          <div
            role="alert"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: "12px", padding: "64px 20px", textAlign: "center",
            }}
          >
            <p style={{ fontSize: "15px", color: "var(--color-terre)" }}>{erreur}</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setFiltres((f) => ({ ...f }))}
            >
              Réessayer
            </button>
          </div>
        ) : chargement ? (
          <div style={GRILLE_STYLE}>
            {Array.from({ length: NB_SKELETONS }).map((_, i) => (
              <CardParcelleSkeleton key={i} />
            ))}
          </div>
        ) : resultatsAffiches.length === 0 ? (
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: "16px", padding: "80px 20px", textAlign: "center", color: "var(--color-tertiaire)",
            }}
          >
            <MountainEmpty size={64} style={{ color: "var(--color-menthe)" }} />
            <p style={{ fontSize: "16px", fontWeight: 500, color: "var(--color-texte)", margin: 0 }}>
              Aucune terre ne correspond à ces critères
            </p>
            <p style={{ fontSize: "14px", color: "var(--color-secondaire)", margin: 0, maxWidth: "320px" }}>
              Essayez d&apos;élargir votre recherche ou de réinitialiser les filtres.
            </p>
            <button type="button" className="btn-secondary" onClick={reinitialiser}>
              Réinitialiser les filtres
            </button>
          </div>
        ) : mode === "grille" ? (
          <div style={GRILLE_STYLE}>
            {resultatsAffiches.map((p, i) => (
              <CardParcelle
                key={p.id}
                parcelle={p}
                index={i}
                enComparaison={comparaison.includes(p.id)}
                onToggleComparaison={toggleComparaison}
              />
            ))}
          </div>
        ) : (
          <CarteParcelles parcelles={resultatsAffiches} />
        )}

        {!erreur && !chargement && (donnees?.next || donnees?.previous) && (
          <nav
            aria-label="Pagination"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginTop: "32px" }}
          >
            <button
              type="button"
              onClick={() => allerPage(donnees?.previous, -1)}
              disabled={!donnees?.previous}
              className="btn-secondary"
              style={{ opacity: donnees?.previous ? 1 : 0.5, cursor: donnees?.previous ? "pointer" : "default" }}
            >
              ‹ Page précédente
            </button>
            <span style={{ fontSize: "13px", color: "var(--color-tertiaire)" }}>Page {page}</span>
            <button
              type="button"
              onClick={() => allerPage(donnees?.next, 1)}
              disabled={!donnees?.next}
              className="btn-secondary"
              style={{ opacity: donnees?.next ? 1 : 0.5, cursor: donnees?.next ? "pointer" : "default" }}
            >
              Page suivante ›
            </button>
          </nav>
        )}
      </main>

      <BarreComparateur parcelles={parcellesComparees} onRetirer={toggleComparaison} />
    </div>
  );
}
