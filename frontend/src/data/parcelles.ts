// Couche data du catalogue de parcelles.
//
// Deux modes, pilotés par NEXT_PUBLIC_USE_MOCKS (.env.local) :
// - true  (à activer explicitement, ex. dev sans backend) : PARCELLES, un jeu
//   de données figé, filtré/trié/paginé en mémoire avec exactement le même
//   vocabulaire de paramètres que l'API réelle (voir ParcellesQueryParams).
// - false, absent, ou toute autre valeur (défaut) : getParcelles()/
//   getParcellesPage()/getParcelleBySlug()/getRegions() appellent l'API
//   réelle via lib/api.ts et normalisent la réponse avec
//   lib/mapAnnonceToParcelle.ts.
//
// Audit du 2026-07-30 : la condition inverse (`!== "false"`) faisait des
// mocks le défaut silencieux en l'absence de variable — un oubli de
// configuration dégradait alors vers de fausses annonces plutôt que vers
// l'API réelle. Inversée : seule une valeur explicite "true" active les
// mocks, tout le reste (y compris l'absence de variable) retombe sur l'API.
//
// Query params et pagination alignés sur AKAL_Contrat_Donnees_v1.2.md §4.2-4.3.

import { apiFetch, type Paginated } from "@/lib/api";
import {
  mapAnnonceDetailToParcelle,
  mapAnnonceToParcelle,
  type AnnonceDetailDTO,
  type AnnonceListDTO,
} from "@/lib/mapAnnonceToParcelle";
import type { AccesEau, Parcelle, StatutFoncier } from "@/types/parcelle";

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";
const PAGE_SIZE_DEFAUT = 12;

export const PARCELLES: Parcelle[] = [
  {
    id: "p-01",
    slug: "oliveraie-certifiee-bio-meknes",
    titre: "Oliveraie certifiée bio — Meknès",
    description:
      "Oliveraie en production certifiée bio, exposition sud, système d'irrigation au goutte-à-goutte installé en 2023.",
    prix: 1_260_000,
    prixM2: 30,
    statut: "en_ligne",
    datePublication: "2026-07-10T09:00:00Z",
    createdAt: "2026-07-10T09:00:00Z",
    badge: "Nouveau",
    parcelle: {
      surface: 4.2,
      statutFoncier: "immatricule",
      accesEau: "irriguee",
      topographie: "vallonne",
      latitude: 31.5722,
      longitude: -7.6694,
      regionCode: "meknes-tafilalet",
      regionNom: "Meknès-Tafilalet",
      adresseApproximative: "Aït Ourir, Maroc",
    },
    scoreCourant: { scoreGlobal: 82, sousScores: null, versionPonderation: null },
    photoPrincipale:
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&h=600&fit=crop&auto=format",
    photos: [
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&h=600&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&h=600&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=800&h=600&fit=crop&auto=format",
    ],
  },
  {
    id: "p-02",
    slug: "terrain-irrigue-polyculture-souss",
    titre: "Terrain irrigué polyculture — Souss",
    description:
      "Terrain irrigué en polyculture maraîchère, forage privé, proche des axes de collecte vers Agadir.",
    prix: 2_088_000,
    prixM2: 24,
    statut: "en_ligne",
    datePublication: "2026-06-02T09:00:00Z",
    createdAt: "2026-06-02T09:00:00Z",
    badge: null,
    parcelle: {
      surface: 8.7,
      statutFoncier: "melkia",
      accesEau: "irriguee",
      topographie: "plat",
      latitude: 30.2128,
      longitude: -9.37,
      regionCode: "souss-massa",
      regionNom: "Souss-Massa",
      adresseApproximative: "Biougra, Maroc",
    },
    scoreCourant: { scoreGlobal: 67, sousScores: null, versionPonderation: null },
    photoPrincipale:
      "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=800&h=600&fit=crop&auto=format",
    photos: [
      "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=800&h=600&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&h=600&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?w=800&h=600&fit=crop&auto=format",
    ],
  },
  {
    id: "p-03",
    slug: "parcelle-cerealiere-en-bour-meknes",
    titre: "Parcelle céréalière en bour — Meknès",
    description:
      "Grande parcelle céréalière en bour, sol limoneux profond, accès par piste carrossable toute saison.",
    prix: 1_800_000,
    prixM2: 12,
    statut: "en_ligne",
    datePublication: "2026-04-18T09:00:00Z",
    createdAt: "2026-04-18T09:00:00Z",
    badge: null,
    parcelle: {
      surface: 15.0,
      statutFoncier: "guich",
      accesEau: "bour",
      topographie: "plat",
      latitude: 33.6914,
      longitude: -5.3711,
      regionCode: "meknes-tafilalet",
      regionNom: "Meknès-Tafilalet",
      adresseApproximative: "El Hajeb, Maroc",
    },
    scoreCourant: { scoreGlobal: 54, sousScores: null, versionPonderation: null },
    photoPrincipale:
      "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=800&h=600&fit=crop&auto=format",
    photos: [
      "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=800&h=600&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1467688480561-1ea027f2e8bd?w=800&h=600&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?w=800&h=600&fit=crop&auto=format",
    ],
  },
  {
    id: "p-04",
    slug: "vignoble-etabli-benslimane",
    titre: "Vignoble établi — Benslimane",
    description:
      "Vignoble en production sur coteaux argilo-calcaires, cépages nobles, cave de vinification à proximité immédiate.",
    prix: 1_550_000,
    prixM2: 50,
    statut: "en_ligne",
    datePublication: "2026-07-08T09:00:00Z",
    createdAt: "2026-07-08T09:00:00Z",
    badge: "Nouveau",
    parcelle: {
      surface: 3.1,
      statutFoncier: "immatricule",
      accesEau: "irriguee",
      topographie: "vallonne",
      latitude: 33.6128,
      longitude: -7.1228,
      regionCode: "casablanca-settat",
      regionNom: "Casablanca-Settat",
      adresseApproximative: "Benslimane, Maroc",
    },
    scoreCourant: { scoreGlobal: 91, sousScores: null, versionPonderation: null },
    photoPrincipale:
      "https://images.unsplash.com/photo-1543158181-e6f9f6712055?w=800&h=600&fit=crop&auto=format",
    photos: [
      "https://images.unsplash.com/photo-1543158181-e6f9f6712055?w=800&h=600&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1504701954957-2010ec3bcec1?w=800&h=600&fit=crop&auto=format",
    ],
  },
  {
    id: "p-05",
    slug: "agrumes-vallee-du-gharb",
    titre: "Agrumes — vallée du Gharb",
    description:
      "Verger d'agrumes en pleine production, irrigation goutte-à-goutte, station de conditionnement à 10 minutes.",
    prix: 1_950_000,
    prixM2: 30,
    statut: "en_ligne",
    datePublication: "2026-05-20T09:00:00Z",
    createdAt: "2026-05-20T09:00:00Z",
    badge: null,
    parcelle: {
      surface: 6.5,
      statutFoncier: "soulaliya",
      accesEau: "irriguee",
      topographie: "plat",
      latitude: 34.2214,
      longitude: -5.7081,
      regionCode: "rabat-sale-kenitra",
      regionNom: "Rabat-Salé-Kénitra",
      adresseApproximative: "Sidi Kacem, Maroc",
    },
    scoreCourant: { scoreGlobal: 73, sousScores: null, versionPonderation: null },
    photoPrincipale:
      "https://images.unsplash.com/photo-1591857177580-dc82b9ac4e1e?w=800&h=600&fit=crop&auto=format",
    photos: [
      "https://images.unsplash.com/photo-1591857177580-dc82b9ac4e1e?w=800&h=600&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1587321773736-1d60aa5fe9d8?w=800&h=600&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1571576309635-f41d70e4e7e5?w=800&h=600&fit=crop&auto=format",
    ],
  },
  {
    id: "p-06",
    slug: "terrain-a-amenager-taourirt",
    titre: "Terrain à aménager — Taourirt",
    description:
      "Vaste terrain en bour à fort potentiel de valorisation, relief vallonné, accès difficile hors saison des pluies.",
    prix: 880_000,
    prixM2: 4,
    statut: "en_ligne",
    datePublication: "2026-03-11T09:00:00Z",
    createdAt: "2026-03-11T09:00:00Z",
    badge: null,
    parcelle: {
      surface: 22.0,
      statutFoncier: "melkia",
      accesEau: "bour",
      topographie: "pentu",
      latitude: 34.4072,
      longitude: -2.8975,
      regionCode: "oriental",
      regionNom: "Oriental",
      adresseApproximative: "Taourirt, Maroc",
    },
    scoreCourant: { scoreGlobal: 41, sousScores: null, versionPonderation: null },
    photoPrincipale:
      "https://images.unsplash.com/photo-1530267981375-f0de937f5f13?w=800&h=600&fit=crop&auto=format",
    photos: [
      "https://images.unsplash.com/photo-1530267981375-f0de937f5f13?w=800&h=600&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1483871788521-4f224a86ef37?w=800&h=600&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1605000797498-6f2d4ef407d1?w=800&h=600&fit=crop&auto=format",
    ],
  },
];

// ---------------------------------------------------------------------------
// Régions — GET /api/geo/regions/ (§4.1, non paginé)
// ---------------------------------------------------------------------------

export type Region = { code: string; nom: string };

const REGIONS_MOCK: Region[] = [
  { code: "meknes-tafilalet", nom: "Meknès-Tafilalet" },
  { code: "souss-massa", nom: "Souss-Massa" },
  { code: "casablanca-settat", nom: "Casablanca-Settat" },
  { code: "rabat-sale-kenitra", nom: "Rabat-Salé-Kénitra" },
  { code: "oriental", nom: "Oriental" },
];

export async function getRegions(): Promise<Region[]> {
  if (USE_MOCKS) return REGIONS_MOCK;
  return apiFetch<Region[]>("/geo/regions/");
}

export const STATUTS: StatutFoncier[] = [
  "immatricule",
  "melkia",
  "soulaliya",
  "guich",
  "habous",
];

export const ACCES_EAU_OPTIONS: { value: AccesEau; label: string }[] = [
  { value: "irriguee", label: "Irriguée" },
  { value: "bour", label: "Bour" },
  { value: "mixte", label: "Mixte" },
];

// ---------------------------------------------------------------------------
// Annonces — GET /api/annonces/ (§4.2-4.3) et GET /api/annonces/<slug>/ (§4.4)
// ---------------------------------------------------------------------------

export type ParcellesQueryParams = {
  region?: string; // code
  statut_foncier?: StatutFoncier;
  acces_eau?: AccesEau;
  prix_min?: number;
  prix_max?: number;
  surface_min?: number;
  surface_max?: number;
  ordering?: string; // "date_publication" | "prix_mad" | "surface_ha", préfixe "-" pour desc
  page?: number;
  page_size?: number; // défaut 12, max 50 (borné côté back)
};

export type ParcellesPage = {
  count: number;
  next: string | null;
  previous: string | null;
  results: Parcelle[];
};

// Base factice pour émuler des URLs de pagination absolues en mode mock —
// même vocabulaire de query params que l'API réelle, pour que
// getParcellesPage() traite next/previous de façon identique dans les deux modes.
const MOCK_BASE = "mock://annonces";

function paramsVersRecherche(params: ParcellesQueryParams): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(params)) {
    if (valeur === undefined || valeur === null || valeur === "") continue;
    sp.set(cle, String(valeur));
  }
  return sp;
}

function rechercheVersParams(sp: URLSearchParams): ParcellesQueryParams {
  const params: ParcellesQueryParams = {};
  if (sp.has("region")) params.region = sp.get("region")!;
  if (sp.has("statut_foncier")) params.statut_foncier = sp.get("statut_foncier") as StatutFoncier;
  if (sp.has("acces_eau")) params.acces_eau = sp.get("acces_eau") as AccesEau;
  if (sp.has("prix_min")) params.prix_min = Number(sp.get("prix_min"));
  if (sp.has("prix_max")) params.prix_max = Number(sp.get("prix_max"));
  if (sp.has("surface_min")) params.surface_min = Number(sp.get("surface_min"));
  if (sp.has("surface_max")) params.surface_max = Number(sp.get("surface_max"));
  if (sp.has("ordering")) params.ordering = sp.get("ordering")!;
  if (sp.has("page")) params.page = Number(sp.get("page"));
  if (sp.has("page_size")) params.page_size = Number(sp.get("page_size"));
  return params;
}

function filtrerParcellesParams(liste: Parcelle[], params: ParcellesQueryParams): Parcelle[] {
  return liste.filter((p) => {
    if (params.region && p.parcelle.regionCode !== params.region) return false;
    if (params.statut_foncier && p.parcelle.statutFoncier !== params.statut_foncier) return false;
    if (params.acces_eau && p.parcelle.accesEau !== params.acces_eau) return false;
    if (params.prix_min != null && p.prix < params.prix_min) return false;
    if (params.prix_max != null && p.prix > params.prix_max) return false;
    if (params.surface_min != null && p.parcelle.surface < params.surface_min) return false;
    if (params.surface_max != null && p.parcelle.surface > params.surface_max) return false;
    return true;
  });
}

function trierParcellesParOrdering(liste: Parcelle[], ordering?: string): Parcelle[] {
  const valeur = ordering ?? "-date_publication";
  const desc = valeur.startsWith("-");
  const champ = valeur.replace(/^-/, "");

  const comparateurs: Record<string, (a: Parcelle, b: Parcelle) => number> = {
    prix_mad: (a, b) => a.prix - b.prix,
    surface_ha: (a, b) => a.parcelle.surface - b.parcelle.surface,
    date_publication: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  };
  const comparateur = comparateurs[champ] ?? comparateurs.date_publication;

  return [...liste].sort((a, b) => (desc ? -1 : 1) * comparateur(a, b));
}

function paginerMock(liste: Parcelle[], params: ParcellesQueryParams): ParcellesPage {
  const page = params.page ?? 1;
  const pageSize = params.page_size ?? PAGE_SIZE_DEFAUT;
  const debut = (page - 1) * pageSize;
  const results = liste.slice(debut, debut + pageSize);

  const suivant = paramsVersRecherche({ ...params, page: page + 1, page_size: pageSize });
  const precedent = paramsVersRecherche({ ...params, page: page - 1, page_size: pageSize });

  return {
    count: liste.length,
    next: debut + pageSize < liste.length ? `${MOCK_BASE}?${suivant.toString()}` : null,
    previous: page > 1 ? `${MOCK_BASE}?${precedent.toString()}` : null,
    results,
  };
}

export async function getParcelles(params: ParcellesQueryParams = {}): Promise<ParcellesPage> {
  if (USE_MOCKS) {
    const filtrees = trierParcellesParOrdering(
      filtrerParcellesParams(PARCELLES, params),
      params.ordering,
    );
    return paginerMock(filtrees, params);
  }

  const data = await apiFetch<Paginated<AnnonceListDTO>>("/annonces/", { params });
  return { ...data, results: data.results.map(mapAnnonceToParcelle) };
}

// Consomme directement une URL `next`/`previous` — jamais de recalcul de
// numéro de page côté front (§4.3 du contrat).
export async function getParcellesPage(url: string): Promise<ParcellesPage> {
  if (url.startsWith(MOCK_BASE)) {
    const sp = new URL(url).searchParams;
    return getParcelles(rechercheVersParams(sp));
  }
  const data = await apiFetch<Paginated<AnnonceListDTO>>(url);
  return { ...data, results: data.results.map(mapAnnonceToParcelle) };
}

export async function getParcelleBySlug(slug: string): Promise<Parcelle | null> {
  if (USE_MOCKS) return PARCELLES.find((p) => p.slug === slug) ?? null;

  try {
    const dto = await apiFetch<AnnonceDetailDTO>(`/annonces/${slug}/`);
    return mapAnnonceDetailToParcelle(dto);
  } catch (err) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 404) {
      return null;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Filtres UI (FiltresSidebar) → query params contrat
// ---------------------------------------------------------------------------

export type AccesEauFiltre = "tous" | AccesEau;

export type FiltresState = {
  // Recherche texte : aucun paramètre `q=` documenté côté API (§4.2). Filtre
  // donc UNIQUEMENT la page actuellement chargée, pas l'ensemble du catalogue
  // — limitation connue, suivi proposé côté back (issue api-mismatch).
  recherche: string;
  region: string; // "" = pas de filtre, sinon code (ex. "casablanca-settat")
  // Select unique : le contrat ne documente pas de multi-valeurs pour
  // statut_foncier (contrairement à l'ancienne hypothèse), donc plus de
  // sélection multiple ici.
  statutFoncier: StatutFoncier | "";
  eau: AccesEauFiltre;
  prixMin: number | null;
  prixMax: number | null;
  surfaceMin: number | null;
  surfaceMax: number | null;
};

export const FILTRES_INITIAUX: FiltresState = {
  recherche: "",
  region: "",
  statutFoncier: "",
  eau: "tous",
  prixMin: null,
  prixMax: null,
  surfaceMin: null,
  surfaceMax: null,
};

// Pas de tri par score : "ordering" n'accepte que date_publication, prix_mad,
// surface_ha côté contrat (§4.2) — un tri "score" ne serait correct que sur
// la page courante, pas sur l'ensemble paginé.
export type Tri = "recent" | "prix_asc" | "prix_desc" | "surface";

export function triVersOrdering(tri: Tri): string {
  switch (tri) {
    case "prix_asc":
      return "prix_mad";
    case "prix_desc":
      return "-prix_mad";
    case "surface":
      return "-surface_ha";
    case "recent":
    default:
      return "-date_publication";
  }
}

export function filtresVersParams(
  f: FiltresState,
  tri: Tri,
  page: number,
  pageSize: number = PAGE_SIZE_DEFAUT,
): ParcellesQueryParams {
  return {
    region: f.region || undefined,
    statut_foncier: f.statutFoncier || undefined,
    acces_eau: f.eau === "tous" ? undefined : f.eau,
    prix_min: f.prixMin ?? undefined,
    prix_max: f.prixMax ?? undefined,
    surface_min: f.surfaceMin ?? undefined,
    surface_max: f.surfaceMax ?? undefined,
    ordering: triVersOrdering(tri),
    page,
    page_size: pageSize,
  };
}

export function filtresActifs(f: FiltresState): boolean {
  return (
    f.recherche.trim() !== "" ||
    f.region !== "" ||
    f.statutFoncier !== "" ||
    f.eau !== "tous" ||
    f.prixMin != null ||
    f.prixMax != null ||
    f.surfaceMin != null ||
    f.surfaceMax != null
  );
}

// Normalise une chaîne pour comparaison insensible à la casse / aux accents.
function normaliser(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Recherche texte côté client — voir le commentaire sur FiltresState.recherche.
export function filtrerRecherche(liste: Parcelle[], recherche: string): Parcelle[] {
  if (!recherche.trim()) return liste;
  const q = normaliser(recherche.trim());
  return liste.filter((p) => normaliser(`${p.titre} ${p.parcelle.regionNom}`).includes(q));
}
