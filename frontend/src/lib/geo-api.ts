// Référentiel géographique (région/province/commune) — endpoints publics,
// non paginés (backend/geo). Utilisable côté client comme côté serveur :
// contrairement à annonces-api.ts, aucune authentification n'est requise
// ici, donc pas besoin du forwarding de cookies (cf. lib/auth-api.ts).

import { apiFetch } from "./api";
import type {
  CommuneGeomRef,
  CommuneRef,
  ProvinceGeomRef,
  ProvinceRef,
  RegionOfficielleRef,
  RegionRef,
} from "@/types/depot-annonce";

export function fetchRegions(): Promise<RegionRef[]> {
  return apiFetch<RegionRef[]>("/geo/regions/");
}

export function fetchProvinces(regionCode: string): Promise<ProvinceRef[]> {
  return apiFetch<ProvinceRef[]>("/geo/provinces/", { params: { region: regionCode } });
}

export function fetchCommunes(provinceCode: string): Promise<CommuneRef[]> {
  return apiFetch<CommuneRef[]>("/geo/communes/", { params: { province: provinceCode } });
}

// ---------------------------------------------------------------------------
// Référentiel géométrique officiel (2026-08-06) — /api/geo/limites/...
//
// Réponses en GeoJSON FeatureCollection (provinces/communes) : `id` est un
// membre de premier niveau de chaque Feature (convention GeoJSON standard,
// cf. RFC 7946), jamais dans `properties` — à ne pas oublier en dé-
// enveloppant vers les Ref plates ci-dessous. La géométrie elle-même
// (`feature.geometry`) ne sert pas ici : ces fonctions alimentent de
// simples listes déroulantes en cascade, pas une carte.
// ---------------------------------------------------------------------------

type FeatureCollectionGeoJSON<P> = {
  type: "FeatureCollection";
  features: Array<{ id: number; type: "Feature"; geometry: unknown; properties: P }>;
};

type ProvinceGeomProperties = {
  iso: string;
  nom: string;
  nom_ar: string;
  region: RegionOfficielleRef;
};

type CommuneGeomProperties = {
  nom_affichage: string;
  type_commune: "CR" | "MU" | null;
  province: { id: number; nom: string };
  region: RegionOfficielleRef;
};

export function fetchRegionsOfficielles(): Promise<RegionOfficielleRef[]> {
  return apiFetch<RegionOfficielleRef[]>("/geo/limites/regions/");
}

export async function fetchProvincesGeom(regionSlug: string): Promise<ProvinceGeomRef[]> {
  const collection = await apiFetch<FeatureCollectionGeoJSON<ProvinceGeomProperties>>(
    "/geo/limites/provinces/",
    { params: { region: regionSlug } },
  );
  return collection.features.map((f) => ({
    id: f.id,
    iso: f.properties.iso,
    nom: f.properties.nom,
    region: f.properties.region,
  }));
}

// `province` et `region` sont mutuellement exclusifs en pratique (la cascade
// du formulaire ne connaît la province qu'après avoir choisi la région) —
// les deux restent acceptés séparément côté API (l'un des deux suffit).
export async function fetchCommunesGeom(params: { province?: number; region?: string }): Promise<CommuneGeomRef[]> {
  const collection = await apiFetch<FeatureCollectionGeoJSON<CommuneGeomProperties>>(
    "/geo/limites/communes/",
    { params },
  );
  return collection.features.map((f) => ({
    id: f.id,
    nomAffichage: f.properties.nom_affichage,
    typeCommune: f.properties.type_commune,
    province: f.properties.province,
    region: f.properties.region,
  }));
}

// Géométrie d'UNE province (audit zoom cascade du 19/08) — contrairement à
// fetchProvincesGeom ci-dessus (qui alimente une liste déroulante et jette
// la géométrie), sert au cadrage automatique de la carte du catalogue
// quand l'utilisateur affine sa recherche jusqu'à une province précise
// (cf. VolVersRegion, CarteRegions.tsx). Pas d'endpoint dédié
// /limites/provinces/<id>/ côté back (seules les communes en ont un,
// cf. fetchCommuneGeomDetail) — on retrouve la province dans la même
// FeatureCollection déjà utilisée par la cascade de filtres, juste sans
// jeter sa géométrie cette fois.
export async function fetchProvinceGeomBounds(regionSlug: string, provinceId: number): Promise<unknown | null> {
  const collection = await apiFetch<FeatureCollectionGeoJSON<ProvinceGeomProperties>>(
    "/geo/limites/provinces/",
    { params: { region: regionSlug } },
  );
  return collection.features.find((f) => f.id === provinceId)?.geometry ?? null;
}

// Une seule commune, avec sa province et sa région — pas de lookup inverse
// autrement disponible depuis un simple id (cf. api_views.py côté back).
// Sert uniquement à reconstruire la cascade région/province/commune quand
// on ouvre le formulaire de modification d'une annonce déjà géolocalisée
// (EtapeLocalisation ne connaît que l'id de commune stocké sur la
// parcelle, jamais sa région/province d'origine).
export async function fetchCommuneGeomDetail(id: number): Promise<CommuneGeomRef> {
  const feature = await apiFetch<{ id: number; type: "Feature"; geometry: unknown; properties: CommuneGeomProperties }>(
    `/geo/limites/communes/${id}/`,
  );
  return {
    id: feature.id,
    nomAffichage: feature.properties.nom_affichage,
    typeCommune: feature.properties.type_commune,
    province: feature.properties.province,
    region: feature.properties.region,
    geometry: feature.geometry,
  };
}
