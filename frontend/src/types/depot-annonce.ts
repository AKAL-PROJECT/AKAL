// Types d'écriture pour le dépôt d'annonce (F03) — distincts de types/parcelle.ts,
// qui reflète les DTO de lecture (allégés/anonymisés). Alignés sur
// ParcelleEcritureSerializer / AnnonceEcritureSerializer (backend/annonces/serializers.py)
// et directement sur les choices réels des modèles Django (pas une invention côté front :
// backend/annonces/models.py — Parcelle.Topographie / Parcelle.AccesRoutier).

import type { AccesEau, StatutFoncier } from "./parcelle";

export type Topographie = "plat" | "pentu" | "vallonne";
export type AccesRoutier = "goudron" | "piste" | "difficile";

// Sous-objet parcelle tel qu'accepté/renvoyé par ParcelleEcritureSerializer.
// `commune`/`latitude`/`longitude` restent optionnels : un brouillon peut
// exister avant que l'étape "Localisation" ne soit renseignée (§6.1).
export type ParcelleEcriture = {
  surface_ha: number;
  statut_foncier: StatutFoncier | "";
  acces_eau: AccesEau | "";
  topographie: Topographie | "";
  acces_routier: AccesRoutier | "";
  commune: number | null;
  latitude: number | null;
  longitude: number | null;
  // Sommets du polygone dessiné par le vendeur (mode "Polygone" du picker
  // carte, RC 2026-08-04), [lat, lng][], ≥3 points — n'existe que si le
  // vendeur a choisi ce mode ; le point (latitude/longitude ci-dessus) reste
  // toujours renseigné aussi (centroïde calculé côté client), donc
  // Annonce.can_publish() côté backend n'a besoin de rien de plus.
  contour: [number, number][] | null;
};

export type PhotoEcriture = {
  id: string;
  url: string | null;
  ordre: number;
};

// Statut manipulable par ce formulaire. brouillon/en_ligne : dépôt initial
// (F03). archivee : édition d'une annonce archivée réintroduite pour la
// RC (le PATCH contenu backend est déjà sans restriction de statut, cf.
// AnnonceUpdateAPIView) — vendue reste hors périmètre, statut terminal.
export type StatutBrouillon = "brouillon" | "en_ligne" | "archivee";

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
