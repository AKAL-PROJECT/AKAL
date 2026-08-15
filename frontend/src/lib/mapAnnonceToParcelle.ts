// Mapping DTO API (forme brute renvoyée par Django REST Framework) → type
// front `Parcelle` (types/parcelle.ts).
//
// DTOs alignés sur AKAL_Contrat_Donnees_v1.2.md §4.4. La liste et le détail
// renvoient des formes différentes ("sous-ensemble allégé" pour la liste,
// cf. §4.4) — d'où deux DTO et deux mappers distincts.
//
// `type_culture` a été retiré du contrat en v1.2 (changement cassant,
// gouvernance §7) : jamais migré en enum fiable côté back, et le front avait
// de toute façon déjà tranché de ne pas l'exposer en UI.

import type {
  AccesEau,
  AnnonceProprietaire,
  Parcelle,
  ScoreCourant,
  StatutAnnonce,
  StatutFoncier,
  Topographie,
} from "@/types/parcelle";

type RegionDTO = {
  code: string;
  nom: string;
};

type LocalisationListDTO = {
  latitude: number;
  longitude: number;
};

type LocalisationDetailDTO = LocalisationListDTO & {
  adresse_approximative: string;
};

type ParcelleListDTO = {
  id: string;
  surface_ha: number;
  statut_foncier: StatutFoncier;
  acces_eau: AccesEau;
  topographie?: Topographie | null;
  region: RegionDTO | null;
  localisation: LocalisationListDTO;
};

type ParcelleDetailDTO = Omit<ParcelleListDTO, "localisation"> & {
  localisation: LocalisationDetailDTO;
  metadata?: Record<string, unknown>;
  // Déjà envoyés par ParcelleDetailSerializer, jusque-là jamais mappés côté
  // front (P2-01 : besoin d'identification réelle pour le Passeport
  // Agronomique). Optionnels ici (pas seulement nullable) : la fixture de
  // test mapAnnonceToParcelle.test.ts est un JSON verbatim du contrat
  // v1.2 §4.4, gelé — absent de ce contrat d'origine, jamais retouché pour
  // matcher un ajout ultérieur au serializer réel. `contour` volontairement
  // absent d'ici : la fiche publique ne l'expose pas (confidentialité, cf.
  // types/parcelle.ts) — n'existe donc pas dans ce DTO, jamais à ajouter
  // sans une décision explicite qui changerait ce choix côté back.
  province?: string | null;
  commune?: string | null;
};

// Liste : allégé à score_global seul (§4.4).
type ScoreCourantListDTO = {
  score_global: number;
} | null;

// Détail : objet complet.
type ScoreCourantDetailDTO = {
  score_global: number;
  sous_scores: Record<string, number>;
  version_ponderation: string;
} | null;

export type AnnonceListDTO = {
  id: string;
  slug: string;
  titre: string;
  prix_mad: number;
  statut: StatutAnnonce;
  parcelle: ParcelleListDTO;
  score_courant: ScoreCourantListDTO;
  photo_principale: string | null;
  created_at: string;
};

export type PhotoDTO = {
  id: string;
  url: string;
  ordre: number;
};

export type AnnonceDetailDTO = {
  id: string;
  slug: string;
  titre: string;
  description: string;
  prix_mad: number;
  statut: StatutAnnonce;
  date_publication: string | null;
  parcelle: ParcelleDetailDTO;
  score_courant: ScoreCourantDetailDTO;
  photos: PhotoDTO[]; // toujours triées par ordre croissant, [] si vide
  proprietaire: { id: string; telephone_masque: string | null }; // anonymisé - RGPD/loi 09-08, §4.5
  created_at: string;
  updated_at: string;
};

const UNE_SEMAINE_MS = 7 * 24 * 60 * 60 * 1000;

// "Nouveau" si créée il y a moins d'une semaine — calculé front, jamais
// renvoyé par le back. Basé sur created_at (toujours présent), pas
// date_publication (absent en liste, cf. §4.4).
function calculerBadge(createdAt: string): string | null {
  const cree = new Date(createdAt).getTime();
  if (Number.isNaN(cree)) return null;
  return Date.now() - cree < UNE_SEMAINE_MS ? "Nouveau" : null;
}

function calculerPrixM2(prix: number, surfaceHa: number): number {
  const surfaceM2 = surfaceHa * 10_000;
  return surfaceM2 > 0 ? Math.round(prix / surfaceM2) : 0;
}

function mapScoreCourant(dto: ScoreCourantListDTO | ScoreCourantDetailDTO): ScoreCourant | null {
  if (dto == null) return null;
  return {
    scoreGlobal: dto.score_global,
    sousScores: "sous_scores" in dto ? dto.sous_scores : null,
    versionPonderation: "version_ponderation" in dto ? dto.version_ponderation : null,
  };
}

// Réponse de GET /api/annonces/ (un élément de `results[]`).
export function mapAnnonceToParcelle(dto: AnnonceListDTO): Parcelle {
  return {
    id: dto.id,
    slug: dto.slug,
    titre: dto.titre,
    description: "", // non exposé en liste (allégé)
    // Number(...) : blindage contre une régression de COERCE_DECIMAL_TO_STRING
    // côté DRF (qui sérialise les DecimalField en string par défaut) — coût
    // nul, rend le mapper tolérant même si le contrat numérique est rompu.
    prix: Number(dto.prix_mad),
    prixM2: calculerPrixM2(Number(dto.prix_mad), Number(dto.parcelle.surface_ha)),
    statut: dto.statut,
    datePublication: null, // absent en liste — voir createdAt
    createdAt: dto.created_at,
    badge: calculerBadge(dto.created_at),
    parcelle: {
      surface: Number(dto.parcelle.surface_ha),
      statutFoncier: dto.parcelle.statut_foncier,
      accesEau: dto.parcelle.acces_eau,
      topographie: dto.parcelle.topographie ?? null,
      latitude: dto.parcelle.localisation.latitude,
      longitude: dto.parcelle.localisation.longitude,
      // AUDIT — conflit de merge résolu littéralement (branche
      // acheteur-catalogue-carte : region non-optionnelle + province/commune ;
      // branche vendeur-auth-contact : region?.code ?? null). Gardé l'optional
      // chaining d'Ibrahim (plus défensif) + mes champs province/commune —
      // jamais vérifié QUAND region peut réellement être absente côté
      // vendeur-auth-contact ni si regionCode/regionNom (typés `string` non
      // nullable dans types/parcelle.ts) tolèrent vraiment `null` en aval —
      // à valider, cf. rapport d'audit.
      regionCode: dto.parcelle.region?.code ?? null,
      regionNom: dto.parcelle.region?.nom ?? null,
      province: null, // absent en liste (ParcelleListSerializer)
      commune: null, // absent en liste
      adresseApproximative: null, // absent en liste
      contour: null, // jamais exposé publiquement, cf. types/parcelle.ts
    },
    scoreCourant: mapScoreCourant(dto.score_courant),
    photoPrincipale: dto.photo_principale,
    photos: [],
  };
}

// Réponse de GET /api/annonces/mes-annonces/ (dashboard propriétaire).
// Ne lit jamais dto.parcelle.region ni dto.parcelle.localisation — tous deux
// null tant que l'annonce (brouillon compris) n'a pas été localisée, cf.
// AnnonceProprietaire.
export function mapAnnonceToAnnonceProprietaire(dto: AnnonceListDTO): AnnonceProprietaire {
  return {
    id: dto.id,
    slug: dto.slug,
    titre: dto.titre,
    prix: Number(dto.prix_mad),
    statut: dto.statut,
    surface: Number(dto.parcelle.surface_ha),
    createdAt: dto.created_at,
    photoPrincipale: dto.photo_principale,
  };
}

// Réponse de GET /api/annonces/<slug>/.
export function mapAnnonceDetailToParcelle(dto: AnnonceDetailDTO): Parcelle {
  return {
    id: dto.id,
    slug: dto.slug,
    titre: dto.titre,
    description: dto.description,
    // Number(...) : blindage contre une régression de COERCE_DECIMAL_TO_STRING
    // côté DRF (qui sérialise les DecimalField en string par défaut) — coût
    // nul, rend le mapper tolérant même si le contrat numérique est rompu.
    prix: Number(dto.prix_mad),
    prixM2: calculerPrixM2(Number(dto.prix_mad), Number(dto.parcelle.surface_ha)),
    statut: dto.statut,
    datePublication: dto.date_publication,
    createdAt: dto.created_at,
    badge: calculerBadge(dto.created_at),
    parcelle: {
      surface: Number(dto.parcelle.surface_ha),
      statutFoncier: dto.parcelle.statut_foncier,
      accesEau: dto.parcelle.acces_eau,
      topographie: dto.parcelle.topographie ?? null,
      latitude: dto.parcelle.localisation.latitude,
      longitude: dto.parcelle.localisation.longitude,
      // AUDIT — même conflit que mapAnnonceToParcelle() ci-dessus, résolu à
      // l'identique.
      regionCode: dto.parcelle.region?.code ?? null,
      regionNom: dto.parcelle.region?.nom ?? null,
      province: dto.parcelle.province ?? null,
      commune: dto.parcelle.commune ?? null,
      adresseApproximative: dto.parcelle.localisation.adresse_approximative,
      contour: null, // jamais exposé publiquement, cf. types/parcelle.ts
    },
    scoreCourant: mapScoreCourant(dto.score_courant),
    // photos toujours triées par ordre croissant côté API (§4.4) ; ordre 0 = principale.
    photoPrincipale: dto.photos[0]?.url ?? null,
    photos: dto.photos.map((p) => p.url),
    proprietaire: {
      id: dto.proprietaire.id,
      telephoneMasque: dto.proprietaire.telephone_masque,
    },
  };
}
