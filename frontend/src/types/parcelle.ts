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
  // AUDIT — CONFLIT DE FOND, résolu ici en gardant la version la PLUS
  // PERMISSIVE (celle de vendeur-auth-contact) pour mesurer l'impact réel
  // via tsc plutôt que de le masquer : cette branche (acheteur-catalogue-
  // carte) supposait latitude/longitude/regionCode/regionNom TOUJOURS
  // présents (cohérent avec le catalogue public, qui ne montre que des
  // annonces en_ligne donc géolocalisées par construction, cf.
  // can_publish() côté back) ; vendeur-auth-contact les rend nullables
  // (cohérent avec un brouillon pas encore localisé). Les deux ont raison
  // dans LEUR contexte respectif — mais c'est le MÊME type Parcelle
  // partagé par les deux. Voir le rapport d'audit pour la liste des call
  // sites carte qui supposent le non-null et cassent avec cette version.
  latitude: number | null;
  longitude: number | null;
  regionCode: string | null;
  regionNom: string | null;
  // Absents en liste (allégée, ParcelleListSerializer) — présents en détail
  // uniquement (ParcelleDetailSerializer expose bien province/commune
  // depuis 2026-08-06, malgré ce qu'indiquait encore ce commentaire —
  // corrigé au passage de P2-01 : le nom de la commune était déjà public de
  // facto via adresseApproximative, "<commune>, Maroc").
  province: string | null;
  commune: string | null;
  adresseApproximative: string | null;
  // Contour polygonal réel (DonneesGeo côté back) — TOUJOURS null ici, par
  // construction : ParcelleDetailSerializer (fiche publique) omet
  // volontairement ce champ, même logique de confidentialité que la
  // position exacte (cf. test_contour_jamais_expose_sur_la_fiche_publique,
  // backend/annonces/tests.py) — seul le propriétaire y a accès, via le
  // PATCH d'édition. Le type reste prêt à le recevoir (P2-01, Passeport
  // Agronomique : "afficher le contour si disponible") si cette décision de
  // confidentialité est un jour révisée délibérément ; en l'état, ne JAMAIS
  // le peupler depuis mapAnnonceToParcelle.ts.
  contour: { latitude: number; longitude: number }[] | null;
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
// passé l'étape "Localisation" de l'assistant de dépôt. Idem pour les données
// scrapées : latitude/longitude/region peuvent être null.
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
  proprietaire?: { id: string; telephoneMasque: string | null };
};
