// Type front normalisé pour une annonce/parcelle AKAL.
//
// Aligné sur AKAL_Contrat_Donnees_v1.2.md §3-4 (source de vérité — en cas de
// divergence avec l'implémentation réelle, le schéma OpenAPI généré fait foi
// et ce fichier doit être corrigé, jamais l'inverse silencieusement).
//
// Charte de nommage v1 §1 : le back reste en snake_case, la conversion vers
// le vocabulaire interne du front se fait uniquement dans
// lib/mapAnnonceToParcelle.ts — jamais imposée au back.

export type StatutFoncier =
  | "melkia"
  | "soulaliya"
  | "guich"
  | "habous"
  | "immatricule";

export type AccesEau = "irriguee" | "bour" | "mixte";

// Statut de l'annonce (§3.3) — vocabulaire partagé avec le dashboard propriétaire.
// "brouillon" n'apparaît jamais dans le catalogue public (toujours en_ligne),
// seulement via GET /api/annonces/mes-annonces/ (dashboard propriétaire).
export type StatutAnnonce = "brouillon" | "en_attente" | "en_ligne" | "archivee" | "vendue";

// Contrat : "varchar (choices) optionnel" sans liste de valeurs fournie —
// jamais inventer un union fermé sur une donnée dont on n'a pas la liste réelle.
export type Topographie = string;

// Attributs du terrain — reflète le sous-objet `parcelle` de l'API.
// Pas de commune/province : le DTO v1.2 n'expose que la région (code + nom)
// et une adresse approximative, jamais aplati (§3.1, §4.4).
export type ParcelleTerrain = {
  surface: number; // surface_ha
  // Nullable depuis l'import de données scrapées (2026-08-11, cf.
  // backend annonces/models.py) : aucune source externe (Avito, Mubawab)
  // ne documente ces qualités du terrain — même traitement que
  // `topographie` ci-dessous, déjà nullable pour la même raison (contrat
  // v1.2 : "varchar optionnel", jamais un enum fermé pour une donnée dont
  // la présence n'est pas garantie).
  statutFoncier: StatutFoncier | null;
  accesEau: AccesEau | null;
  topographie: Topographie | null;
  latitude: number;
  longitude: number;
  regionCode: string;
  regionNom: string;
  // Absent en liste (allégé) — présent en détail uniquement.
  adresseApproximative: string | null;
};

// AgriScore courant — nullable tant qu'aucun score n'a été calculé (§3.5).
// `sousScores` : clés provisoires en attente de finalisation (MT4) — jamais
// typées en dur, on itère dynamiquement sur l'objet.
export type ScoreCourant = {
  scoreGlobal: number;
  // Absent/vide dans la version liste (allégée à score_global seul).
  sousScores: Record<string, number> | null;
  versionPonderation: string | null;
};

// Ligne d'annonce pour le dashboard propriétaire (GET /api/annonces/mes-annonces/).
// Volontairement distinct de Parcelle : ne porte aucun champ géo/région
// (latitude/longitude/region), non garantis tant que l'annonce n'a pas
// passé l'étape "Localisation" de l'assistant de dépôt — contrairement à
// Parcelle, qui suppose ces champs toujours présents (cf. mapAnnonceToParcelle).
export type AnnonceProprietaire = {
  id: string;
  slug: string;
  titre: string;
  prix: number; // prix_mad
  statut: StatutAnnonce;
  surface: number; // surface_ha — toujours présent, dès la création du brouillon
  createdAt: string;
  photoPrincipale: string | null;
};

export type Parcelle = {
  id: string; // UUID
  slug: string; // routing détail : /parcelles/[slug]
  titre: string;
  description: string; // "" en liste (non exposé, allégé), renseigné en détail
  prix: number; // prix_mad
  prixM2: number; // MAD/m² — calculé (prix / surface en m²)
  statut: StatutAnnonce;
  // Absent en liste (allégée) — renseigné en détail uniquement.
  datePublication: string | null;
  // Toujours présent (liste + détail) — sert de repli fiable pour le badge
  // "Nouveau", calculé front, jamais renvoyé par le back.
  createdAt: string;
  badge: string | null;
  parcelle: ParcelleTerrain;
  scoreCourant: ScoreCourant | null;
  photoPrincipale: string | null;
  photos: string[]; // vide en liste, rempli en détail (§4.4 — trié par ordre croissant)
};
