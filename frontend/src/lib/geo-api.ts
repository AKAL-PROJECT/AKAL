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
