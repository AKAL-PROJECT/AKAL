// Référentiel géographique (région/province/commune) — endpoints publics,
// non paginés (backend/geo). Utilisable côté client comme côté serveur :
// contrairement à annonces-api.ts, aucune authentification n'est requise
// ici, donc pas besoin du forwarding de cookies (cf. lib/auth-api.ts).

import { apiFetch } from "./api";
import type { CommuneRef, ProvinceRef, RegionRef } from "@/types/depot-annonce";

export function fetchRegions(): Promise<RegionRef[]> {
  return apiFetch<RegionRef[]>("/geo/regions/");
}

export function fetchProvinces(regionCode: string): Promise<ProvinceRef[]> {
  return apiFetch<ProvinceRef[]>("/geo/provinces/", { params: { region: regionCode } });
}

export function fetchCommunes(provinceCode: string): Promise<CommuneRef[]> {
  return apiFetch<CommuneRef[]>("/geo/communes/", { params: { province: provinceCode } });
}
