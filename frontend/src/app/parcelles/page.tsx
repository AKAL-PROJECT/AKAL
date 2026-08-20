"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FILTRES_INITIAUX,
  PAGE_SIZE_DEFAUT,
  TAILLES_PAGE_DISPONIBLES,
  filtresVersParams,
  getParcelles,
  getParcellesPage,
  getRegions,
  type BboxCarte,
  type FiltresState,
  type ParcellesPage,
  type Region,
  type TaillePage,
  type Tri,
} from "@/data/parcelles";
import { fetchCommuneGeomDetail, fetchProvinceGeomBounds } from "@/lib/geo-api";
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
    // Permet à un lien externe d'ouvrir directement la vue carte plutôt que
    // de retomber sur la grille par défaut. Le lien "Carte" du header
    // pointe désormais vers /carte (vue plein écran dédiée, refonte nav du
    // 19/08, cf. app/carte/page.tsx) plutôt que vers ce paramètre — ce
    // mécanisme reste néanmoins utile pour tout lien interne qui voudrait
    // ouvrir le catalogue directement en vue carte (ex. bascule Liste/Carte
    // ci-dessous, qui écrit ce même paramètre).
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
  // "Rechercher cette zone" (2026-08-17, à la Airbnb — cf. CarteLeaflet.tsx)
  // — pas dans FiltresState/l'URL comme les autres filtres : c'est une
  // action ponctuelle sur la vue carte, pas un critère qu'on s'attend à
  // retrouver en partageant le lien. Effacée dès qu'un autre filtre change
  // (patchFiltres/reinitialiser ci-dessous) : les deux façons de restreindre
  // la recherche (filtres explicites vs zone de la carte) ne se cumulent pas.
  const [bbox, setBbox] = useState<BboxCarte | null>(null);
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
        return getParcelles(filtresVersParams(filtres, tri, page, mode === "carte" ? TAILLE_CARTE : tailleParPage, bbox));
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
  }, [filtres, tri, page, mode, tailleParPage, bbox]);

  // URL partageable — navigation sans rechargement complet (router.replace shallow).
  useEffect(() => {
    router.replace(versUrl(filtres, tri, page, mode, tailleParPage), { scroll: false });
  }, [filtres, tri, page, mode, tailleParPage, router]);

  // Synchronise `mode` avec `?vue=` quand l'URL change de l'EXTÉRIEUR de ce
  // composant (bug confirmé 2026-08-18 : liens "Explorer"/"Carte" du Navbar,
  // qui pointent tous deux vers /parcelles avec un `?vue=` différent). Next.js
  // App Router ne démonte pas ce composant pour une navigation qui ne change
  // que les search params sur la même route — `initial` (lu une seule fois
  // au montage, cf. useMemo ci-dessus) ne voit donc jamais ce changement.
  // Sans cet effet : clic sur "Carte" depuis Explorer → l'URL passe un
  // instant à ?vue=carte, puis l'effet de synchro URL ci-dessus la réécrit
  // aussitôt d'après `mode`, resté "grille" côté état — impossible de
  // basculer d'une vue à l'autre en restant sur /parcelles, dans les deux
  // sens. Le `setMode` fonctionnel (comparaison avant écriture) évite un
  // aller-retour avec l'effet ci-dessus quand les deux sont déjà d'accord.
  useEffect(() => {
    // setMode différé d'un micro-tick (même pattern que l'effet de
    // chargement plus haut) : un setState synchrone en tête d'effet
    // déclenche un rendu en cascade avant même que React n'ait fini de
    // committer celui-ci (react-hooks/set-state-in-effect).
    Promise.resolve().then(() => {
      const vueUrl: ModeAffichage = searchParams.get("vue") === "carte" ? "carte" : "grille";
      setMode((m) => (m === vueUrl ? m : vueUrl));
    });
  }, [searchParams]);

  const patchFiltres = useCallback((patch: Partial<FiltresState>) => {
    setFiltres((prev) => ({ ...prev, ...patch }));
    setPage(1);
    setBbox(null);
  }, []);

  const reinitialiser = useCallback(() => {
    setFiltres(FILTRES_INITIAUX);
    setPage(1);
    setBbox(null);
  }, []);

  // "Rechercher cette zone" (CarteLeaflet.tsx, BoutonRechercherZone) —
  // remet aussi la page à 1 : la bbox change entièrement le jeu de
  // résultats, rester sur une page 3 par exemple n'aurait aucun sens.
  const rechercherZone = useCallback((zone: BboxCarte) => {
    setBbox(zone);
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
  // `resultats` est déjà filtré par le backend sur `filtres.recherche`
  // (envoyé en `q=`, cf. filtresVersParams/data/parcelles.ts) — plus de
  // second filtrage côté client ici. Un filtrage client par-dessus un
  // `resultats` déjà filtré serveur aurait en plus été FAUX depuis ce
  // câblage : le serveur matche sur titre + description, l'ancien filtre
  // client sur titre + région seulement, donc un résultat retourné par le
  // serveur via la description aurait pu être éliminé à tort ici.
  const resultatsAffiches = resultats;

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

  // Cadrage cascade région/province/commune (audit du 19/08) : dès que le
  // filtre est affiné jusqu'à une province ou une commune précise, la carte
  // doit se recadrer sur CETTE zone administrative (pas seulement sur la
  // moyenne des pins qui matchent, cf. regionActive.centre ci-dessus — un
  // filtre province/commune peut ne retourner que 0-1 résultat sans que la
  // zone elle-même perde son sens). Commune prioritaire sur province si les
  // deux sont renseignées (la cascade des filtres l'empêche normalement,
  // mais rien ne l'interdit structurellement) — la plus précise gagne.
  const [zoneGeometrie, setZoneGeometrie] = useState<unknown | null>(null);
  useEffect(() => {
    let annule = false;
    if (filtres.commune) {
      fetchCommuneGeomDetail(Number(filtres.commune))
        .then((c) => { if (!annule) setZoneGeometrie(c.geometry ?? null); })
        .catch(() => { if (!annule) setZoneGeometrie(null); });
    } else if (filtres.province && filtres.region) {
      fetchProvinceGeomBounds(filtres.region, Number(filtres.province))
        .then((geom) => { if (!annule) setZoneGeometrie(geom); })
        .catch(() => { if (!annule) setZoneGeometrie(null); });
    } else {
      // Différé d'un micro-tick — même convention qu'ailleurs dans ce
      // fichier (ex. le chargement principal du catalogue) : un setState
      // synchrone en tête d'effet déclenche un rendu en cascade avant même
      // que React n'ait fini de committer celui-ci
      // (react-hooks/set-state-in-effect).
      Promise.resolve().then(() => { if (!annule) setZoneGeometrie(null); });
    }
    return () => { annule = true; };
  }, [filtres.commune, filtres.province, filtres.region]);

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
            onRechercherZone={rechercherZone}
            zoneGeometrie={zoneGeometrie}
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
