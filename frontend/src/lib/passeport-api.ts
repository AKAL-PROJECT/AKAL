// Client de l'endpoint Passeport AgriScore — GET /api/parcelles/<id>/passeport/.
//
// Appelé côté navigateur (composant client PasseportAgronomiqueScreen) : la
// coquille de la page est rendue côté serveur depuis la `parcelle` déjà
// chargée, et le passeport lui-même — qui déclenche jusqu'à 5 requêtes vers
// des API externes — arrive ensuite avec un skeleton. Endpoint public
// (`AllowAny`, aucune authentification), CORS déjà ouvert (cf. lib/vue-beacon).
//
// `<id>` = UUID de la Parcelle (`parcelle.parcelle.id`), jamais l'id de
// l'annonce.

import { ApiError, apiFetch } from "./api";

export type DimensionKey = "sol" | "climat" | "ndvi" | "topo" | "acces";

// Ordre canonique d'affichage (poids décroissant côté back : ndvi 25, climat/
// sol/topo 20, acces 15 — ici on garde l'ordre "lecture" sol→accès).
export const DIMENSIONS: readonly DimensionKey[] = ["sol", "climat", "ndvi", "topo", "acces"];

export type StatutCulture = "compatible" | "sous_condition" | "deconseille";

export type CultureSuggeree = {
  culture: string;
  statut: StatutCulture;
  raison: string;
  reserve: string;
};

export type PasseportDimension = {
  statut: "ok" | "indisponible";
  mode: "reel" | "simule";
  sousScore: number | null; // /100, null si indisponible
  confiance: number; // 0–1
  // Dict libre, clés snake_case du back (ph_eau, ndvi_moyen, pente_pct…). Le
  // contrat AgentResult impose d'itérer dynamiquement, jamais de typer ces
  // clés en dur — cf. PRESENTATION_DIMENSION dans lib/passeport-presentation.ts.
  valeurs: Record<string, string | number | null>;
  source: string;
  dateCollecte: string; // ISO 8601
  resolutionM: number | null;
  zoneTamponM: number;
  poidsNominal: number;
  contribution: number;
};

export type Passeport = {
  parcelleId: string;
  genereLe: string; // ISO 8601
  mode: "reel" | "simule" | "mixte";
  scoreGlobal: number | null; // /100, null si aucune dimension exploitable
  fiabiliteGlobale: number; // 0–100 %
  dimensions: Record<DimensionKey, PasseportDimension>;
  dimensionsIndisponibles: DimensionKey[];
  culturesSuggerees: CultureSuggeree[];
  avertissement: string; // "" si mode reel et rien d'indisponible
};

// Raison d'indisponibilité — pilote l'état affiché par l'écran.
// - non_geolocalisee : 422, la parcelle n'a pas de point GPS confirmé
// - introuvable      : 404, UUID inconnu (ne devrait pas arriver depuis une fiche)
// - erreur           : réseau, timeout, 5xx, réponse illisible → "Réessayer"
export type RaisonIndisponible = "non_geolocalisee" | "introuvable" | "erreur";

export class PasseportIndisponibleError extends Error {
  readonly raison: RaisonIndisponible;
  constructor(raison: RaisonIndisponible, options?: { cause?: unknown }) {
    super(raison, options);
    this.name = "PasseportIndisponibleError";
    this.raison = raison;
  }
}

// ── DTO brut (snake_case, miroir du back) ──────────────────────────────────

type DimensionDTO = {
  statut: "ok" | "indisponible";
  mode: "reel" | "simule";
  sous_score: number | null;
  confiance: number;
  valeurs: Record<string, string | number | null> | null;
  source: string;
  date_collecte: string;
  resolution_m: number | null;
  zone_tampon_m: number;
  poids_nominal: number;
  contribution: number;
};

type PasseportDTO = {
  parcelle_id: string;
  genere_le: string;
  mode: "reel" | "simule" | "mixte";
  score_global: number | null;
  fiabilite_globale: number;
  dimensions: Record<DimensionKey, DimensionDTO>;
  dimensions_indisponibles: DimensionKey[];
  cultures_suggerees: { culture: string; statut: StatutCulture; raison: string; reserve: string }[];
  avertissement: string;
};

function mapDimension(d: DimensionDTO): PasseportDimension {
  return {
    statut: d.statut,
    mode: d.mode,
    sousScore: d.sous_score,
    confiance: d.confiance,
    valeurs: d.valeurs ?? {},
    source: d.source,
    dateCollecte: d.date_collecte,
    resolutionM: d.resolution_m,
    zoneTamponM: d.zone_tampon_m,
    poidsNominal: d.poids_nominal,
    contribution: d.contribution,
  };
}

export function mapPasseport(dto: PasseportDTO): Passeport {
  const dimensions = {} as Record<DimensionKey, PasseportDimension>;
  for (const cle of DIMENSIONS) dimensions[cle] = mapDimension(dto.dimensions[cle]);

  return {
    parcelleId: dto.parcelle_id,
    genereLe: dto.genere_le,
    mode: dto.mode,
    scoreGlobal: dto.score_global,
    fiabiliteGlobale: dto.fiabilite_globale,
    dimensions,
    dimensionsIndisponibles: dto.dimensions_indisponibles ?? [],
    culturesSuggerees: (dto.cultures_suggerees ?? []).map((c) => ({
      culture: c.culture,
      statut: c.statut,
      raison: c.raison,
      reserve: c.reserve,
    })),
    avertissement: dto.avertissement ?? "",
  };
}

export async function getPasseport(parcelleId: string): Promise<Passeport> {
  try {
    // 25 s : le pipeline parallélise les 5 agents (~3-5 s cache froid) mais
    // une API externe lente peut approcher AGRISCORE_HTTP_TIMEOUT_S (10 s).
    const dto = await apiFetch<PasseportDTO>(`/parcelles/${parcelleId}/passeport/`, {
      cache: "no-store",
      timeout: 25000,
    });
    return mapPasseport(dto);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 422) throw new PasseportIndisponibleError("non_geolocalisee", { cause: err });
      if (err.status === 404) throw new PasseportIndisponibleError("introuvable", { cause: err });
    }
    // Timeout (apiFetch → Error générique), réseau, 5xx, JSON illisible.
    throw new PasseportIndisponibleError("erreur", { cause: err });
  }
}
