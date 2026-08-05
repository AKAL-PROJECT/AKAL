// Types d'écriture pour le dépôt d'annonce (F03) — distincts de types/parcelle.ts,
// qui reflète les DTO de lecture (allégés/anonymisés). Alignés sur
// ParcelleEcritureSerializer / AnnonceEcritureSerializer (backend/annonces/serializers.py)
// et directement sur les choices réels des modèles Django (pas une invention côté front :
// backend/annonces/models.py — Parcelle.Topographie / Parcelle.AccesRoutier).

import type { AccesEau, StatutFoncier } from "./parcelle";

export type Topographie = "plat" | "pentu" | "vallonne";
export type AccesRoutier = "goudron" | "piste" | "difficile";

// Un sommet du contour polygonal — {latitude, longitude}, jamais de GeoJSON
// brut (même convention que latitude/longitude du point unique, cf. §2/§3 de
// l'audit cartographie du 2026-08-05).
export type SommetContour = { latitude: number; longitude: number };

// Sous-objet parcelle tel qu'accepté/renvoyé par ParcelleEcritureSerializer.
// `commune`/`latitude`/`longitude` restent optionnels : un brouillon peut
// exister avant que l'étape "Localisation" ne soit renseignée (§6.1).
// `contour` (dessin de parcelle, 2026-08-05) : optionnel, ≥3 sommets si
// renseigné — `[]` repasse en mode Point (retire le contour existant),
// absent du payload PATCH = ne touche pas au contour déjà enregistré.
export type ParcelleEcriture = {
  surface_ha: number;
  statut_foncier: StatutFoncier | "";
  acces_eau: AccesEau | "";
  topographie: Topographie | "";
  acces_routier: AccesRoutier | "";
  commune: number | null;
  latitude: number | null;
  longitude: number | null;
  contour: SommetContour[] | null;
};

export type PhotoEcriture = {
  id: string;
  url: string | null;
  ordre: number;
};

// Statut manipulable par ce formulaire — seule la transition brouillon ->
// en_ligne est autorisée côté serveur (validate_statut), archivee/vendue
// sont hors périmètre F03.
export type StatutBrouillon = "brouillon" | "en_ligne";

export type AnnonceEcriture = {
  id: string;
  slug: string;
  titre: string;
  description: string;
  prix_mad: number;
  statut: StatutBrouillon;
  loc_confidentielle: boolean;
  parcelle: ParcelleEcriture;
  photos: PhotoEcriture[];
};

// Référentiel géographique (backend/geo) — {id, code, nom} pour région/
// province, {id, nom} pour commune (pas de code, cf. geo/models.py).
export type RegionRef = { id: number; code: string; nom: string };
export type ProvinceRef = { id: number; code: string; nom: string };
export type CommuneRef = { id: number; nom: string };
