"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FILTRES_INITIAUX,
  PAGE_SIZE_DEFAUT,
  TAILLES_PAGE_DISPONIBLES,
  filtresActifs,
  filtresVersParams,
  filtrerRecherche,
  getParcelles,
  getParcellesPage,
  getRegions,
  type FiltresState,
  type ParcellesPage,
  type Region,
  type TaillePage,
  type Tri,
} from "@/data/parcelles";
import CardParcelle from "@/components/parcelles/CardParcelle";
import { useFavorisIds } from "@/hooks/useFavorisIds";
import { useComparateur } from "@/hooks/useComparateur";
import CardParcelleSkeleton from "@/components/parcelles/CardParcelleSkeleton";
import FiltresSidebar from "@/components/parcelles/FiltresSidebar";
import BarreComparateur from "@/components/parcelles/BarreComparateur";
import CarteParcelles from "@/components/parcelles/CarteParcelles";
import type { RegionActive } from "@/components/parcelles/CarteRegions";
import { Grid, Map, Filter } from "@/components/icons/Icons";
import { EtatVide } from "@/components/EtatVide";

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
// Vue carte : pas de pagination visible ni de sens à en avoir (on explore
// géographiquement, pas page par page) — on demande le maximum autorisé par
// le contrat plutôt que la taille de page grille (12 sur 122 annonces ne
// montrait presque rien). 50 = max_page_size côté backend (annonces/api_views.py) ;
// si le catalogue dépasse 50 résultats pour un même filtre, seuls les 50
// premiers (les plus récents) apparaissent sur la carte — même limite que
// la carte de couverture de l'accueil (CouvertureSection).
const TAILLE_CARTE = 50;
const NB_SKELETONS = 8;

// ── URL ↔ état (persistance des filtres, §M-3 : "URL partageable") ──────────
function lireDepuisUrl(sp: URLSearchParams): { filtres: FiltresState; tri: Tri; page: number; vue: ModeAffichage; tailleParPage: TaillePage } {
  // Valeur arbitraire dans l'URL (lien trafiqué/obsolète) → retombe sur le
  // défaut plutôt que de propager une taille de page non supportée.
  const tailleUrl = Number(sp.get("page_size"));
  const tailleParPage: TaillePage = (TAILLES_PAGE_DISPONIBLES as readonly number[]).includes(tailleUrl)
    ? (tailleUrl as TaillePage)
    : PAGE_SIZE_DEFAUT;

  return {
    filtres: {
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
    },
    tri: (sp.get("tri") as Tri) ?? "recent",
    page: sp.has("page") ? Math.max(1, Number(sp.get("page")) || 1) : 1,
    // Permet à un lien externe (ex. "Carte" du header) d'ouvrir directement
    // la vue carte plutôt que de retomber sur la grille par défaut, ce qui
    // rendait ce lien indiscernable de "Explorer" (les deux menaient au
    // même /parcelles en mode grille).
    vue: sp.get("vue") === "carte" ? "carte" : "grille",
    tailleParPage,
  };
}

function versUrl(filtres: FiltresState, tri: Tri, page: number, vue: ModeAffichage, tailleParPage: TaillePage): string {
  const sp = new URLSearchParams();
  if (filtres.recherche) sp.set("q", filtres.recherche);
  if (filtres.region) sp.set("region", filtres.region);
  if (filtres.province) sp.set("province", filtres.province);
  if (filtres.commune) sp.set("commune", filtres.commune);
  if (filtres.statutFoncier) sp.set("statut_foncier", filtres.statutFoncier);
  if (filtres.eau !== "tous") sp.set("eau", filtres.eau);
  if (filtres.prixMin != null) sp.set("prix_min", String(filtres.prixMin));
  if (filtres.prixMax != null) sp.set("prix_max", String(filtres.prixMax));
  if (filtres.surfaceMin != null) sp.set("surface_min", String(filtres.surfaceMin));
  if (filtres.surfaceMax != null) sp.set("surface_max", String(filtres.surfaceMax));
  if (tri !== "recent") sp.set("tri", tri);
  if (page !== 1) sp.set("page", String(page));
  if (vue === "carte") sp.set("vue", "carte");
  if (tailleParPage !== PAGE_SIZE_DEFAUT) sp.set("page_size", String(tailleParPage));
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

  const [mode, setMode] = useState<ModeAffichage>(initial.vue);
  const [tri, setTri] = useState<Tri>(initial.tri);
  const [page, setPage] = useState(initial.page);
  const [tailleParPage, setTailleParPage] = useState<TaillePage>(initial.tailleParPage);
  const [filtres, setFiltres] = useState<FiltresState>(initial.filtres);
  const [sidebarOuverte, setSidebarOuverte] = useState(false);
  const { favorisIds, toggleFavori } = useFavorisIds();
  const { parcelles: parcellesComparees, basculer: basculerComparaison, estEnComparaison, retirer: retirerComparaison } = useComparateur();

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

    // setChargement/setErreur sont volontairement dans le .then() plutôt
    // qu'en tête de l'effet : un setState synchrone dans le corps d'un
    // effet déclenche un rendu en cascade avant même le démarrage du fetch
    // (react-hooks/set-state-in-effect). Les différer d'un micro-tick via
    // Promise.resolve() est imperceptible pour l'utilisateur et corrige le
    // vrai problème plutôt que de contourner la règle.
    Promise.resolve()
      .then(() => {
        if (annule) return undefined;
        setChargement(true);
        setErreur(null);
        return getParcelles(filtresVersParams(filtres, tri, page, mode === "carte" ? TAILLE_CARTE : tailleParPage));
      })
      .then((res) => {
        if (!annule && res) setDonnees(res);
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
  }, [filtres, tri, page, mode, tailleParPage]);

  // URL partageable — navigation sans rechargement complet (router.replace shallow).
  useEffect(() => {
    router.replace(versUrl(filtres, tri, page, mode, tailleParPage), { scroll: false });
  }, [filtres, tri, page, mode, tailleParPage, router]);

  const patchFiltres = useCallback((patch: Partial<FiltresState>) => {
    setFiltres((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  const reinitialiser = useCallback(() => {
    setFiltres(FILTRES_INITIAUX);
    setPage(1);
  }, []);

  // P1-02 — changer la taille de page ne doit toucher à aucun autre filtre
  // (§6 du ticket), juste revenir en page 1 pour ne pas atterrir sur une
  // page qui n'existe plus au nouveau découpage (ex. page 4 à 12/page = au-
  // delà de la dernière page une fois passé à 48/page).
  const changerTailleParPage = useCallback((taille: TaillePage) => {
    setTailleParPage(taille);
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

  // useMemo (pas juste `donnees?.results ?? []`) : sinon nouvelle référence
  // de tableau à chaque render, qui invaliderait le useMemo de regionActive
  // ci-dessous à chaque frappe/interaction sans rapport (react-hooks/
  // exhaustive-deps).
  const resultats = useMemo(() => donnees?.results ?? [], [donnees]);
  // Recherche texte : filtre côté client, limité à la page actuellement
  // chargée — voir le commentaire sur FiltresState.recherche (data/parcelles.ts).
  const resultatsAffiches = filtrerRecherche(resultats, filtres.recherche);

  // Région active pour la carte (P0-02/P0-03) : `filtres.region` est déjà
  // envoyé au serveur (filtresVersParams), donc `resultats` ne contient
  // déjà que des parcelles de cette région quand elle est sélectionnée —
  // centre dérivé de leur moyenne réelle, jamais un centroïde inventé côté
  // front (même principe que statsParRegion, components/home/CouvertureSection.tsx).
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

  // basculerComparaison prend une Parcelle complète (useComparateur), alors
  // que CardParcelle expose un id (cf. sa propre prop onToggleComparaison) —
  // résolue depuis `resultats`, déjà en mémoire (pas de nouveau fetch).
  const toggleComparaison = (id: string) => {
    const p = resultats.find((r) => r.id === id);
    if (p) basculerComparaison(p);
  };

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
      <main style={{ flex: 1, minWidth: 0, padding: "20px", paddingBottom: parcellesComparees.length > 0 ? "96px" : "20px" }}>
        {/* Page sans titre visible jusqu'ici — absence de h1 (revue a11y,
            Phase 3) : la navigation par titres au clavier/lecteur d'écran
            n'avait aucun repère pour cet écran. */}
        <h1 style={{ fontSize: "22px", margin: "0 0 16px" }}>Explorer les parcelles</h1>

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
              className="hidden-desktop btn-toggle-filtres akal-focusable"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "14px",
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-bordure)",
                backgroundColor: "white",
                cursor: "pointer",
                color: "var(--color-texte)",
                transition: "background-color 150ms ease, border-color 150ms ease",
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
              className="select-chevron"
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                fontSize: "14px",
                border: "1px solid var(--color-bordure)",
                backgroundColor: "white",
              }}
            >
              <option value="recent">Plus récentes</option>
              <option value="prix_asc">Prix croissant</option>
              <option value="prix_desc">Prix décroissant</option>
              <option value="surface">Superficie</option>
            </select>

            {/* P1-02 — nombre de résultats par page, uniquement en vue
                grille (la vue carte a sa propre taille fixe, TAILLE_CARTE
                ci-dessus, pensée pour explorer géographiquement plutôt que
                page par page). */}
            {mode === "grille" && (
              <div
                role="group"
                aria-label="Annonces par page"
                style={{ display: "flex", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-bordure)", overflow: "hidden" }}
              >
                {TAILLES_PAGE_DISPONIBLES.map((taille, i) => (
                  <button
                    key={taille}
                    type="button"
                    onClick={() => changerTailleParPage(taille)}
                    aria-pressed={tailleParPage === taille}
                    className="akal-focusable"
                    style={{
                      padding: "8px 12px",
                      border: "none",
                      borderLeft: i > 0 ? "1px solid var(--color-bordure)" : "none",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 500,
                      backgroundColor: tailleParPage === taille ? "var(--color-rosee)" : "white",
                      color: tailleParPage === taille ? "var(--color-foret)" : "var(--color-tertiaire)",
                      transition: "background-color 150ms ease",
                    }}
                  >
                    {taille}
                  </button>
                ))}
              </div>
            )}

            {/* Toggle grille / carte */}
            <div style={{ display: "flex", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-bordure)", overflow: "hidden" }}>
              <button
                type="button"
                onClick={() => { setMode("grille"); setPage(1); }}
                aria-pressed={mode === "grille"}
                aria-label="Vue grille"
                className="akal-focusable"
                style={{ padding: "8px 12px", border: "none", cursor: "pointer", display: "flex", backgroundColor: mode === "grille" ? "var(--color-rosee)" : "white", transition: "background-color 150ms ease" }}
              >
                <Grid size={15} style={{ color: mode === "grille" ? "var(--color-foret)" : "var(--color-tertiaire)" }} />
              </button>
              <button
                type="button"
                onClick={() => { setMode("carte"); setPage(1); }}
                aria-pressed={mode === "carte"}
                aria-label="Vue carte"
                className="akal-focusable"
                style={{ padding: "8px 12px", border: "none", borderLeft: "1px solid var(--color-bordure)", cursor: "pointer", display: "flex", backgroundColor: mode === "carte" ? "var(--color-rosee)" : "white", transition: "background-color 150ms ease" }}
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
            className="akal-alert-in"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: "12px", padding: "64px 20px", textAlign: "center",
            }}
          >
            <p style={{ fontSize: "15px", color: "var(--color-terre-texte)" }}>{erreur}</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setFiltres((f) => ({ ...f }))}
            >
              Réessayer
            </button>
          </div>
        ) : chargement ? (
          <div className="akal-fade-in" style={GRILLE_STYLE}>
            {/* P1-02 : autant de squelettes que d'annonces attendues en vue
                grille (tailleParPage) — évite un décalage visuel entre 8
                squelettes et, par ex., 48 cartes réelles qui apparaissent
                d'un coup. Vue carte inchangée (NB_SKELETONS), pas concernée
                par ce sélecteur. */}
            {Array.from({ length: mode === "grille" ? tailleParPage : NB_SKELETONS }).map((_, i) => (
              <CardParcelleSkeleton key={i} />
            ))}
          </div>
        ) : resultatsAffiches.length === 0 ? (
          <EtatVide
            titre="Aucun terrain ne correspond à votre recherche"
            description="Essayez d'élargir votre recherche ou de réinitialiser les filtres."
            action={
              <button type="button" className="btn-secondary" onClick={reinitialiser}>
                Réinitialiser les filtres
              </button>
            }
          />
        ) : mode === "grille" ? (
          <div style={GRILLE_STYLE}>
            {resultatsAffiches.map((p, i) => (
              <CardParcelle
                key={p.id}
                parcelle={p}
                index={i}
                favori={favorisIds.has(p.id)}
                onToggleFavori={toggleFavori}
                enComparaison={estEnComparaison(p.id)}
                onToggleComparaison={toggleComparaison}
              />
            ))}
          </div>
        ) : (
          <CarteParcelles
            parcelles={resultatsAffiches}
            regions={regions}
            regionActive={regionActive}
            onSelectionnerRegion={(code) => patchFiltres({ region: filtres.region === code ? "" : code })}
          />
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

      {/* retirerComparaison directement (pas toggleComparaison, qui résout
          l'id via `resultats` — un ajout suivi d'un changement de page/filtre
          ferait échouer silencieusement le retrait, la parcelle n'étant plus
          dans `resultats`). */}
      <BarreComparateur parcelles={parcellesComparees} onRetirer={retirerComparaison} />
    </div>
  );
}
