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
  // AUDIT — conflit de fond entre les deux branches, tranché en équipe le
  // 2026-08-15 (cf. rapport d'audit, bloquants #3/#4) : NON-null, pas
  // nullable. Vérifié empiriquement plutôt que supposé — Annonce.can_publish()
  // / Parcelle.is_geolocated() (backend/annonces/models.py) exigent
  // commune_geom + latitude + longitude + geom pour TOUTE transition
  // entrante vers en_ligne (brouillon, en_attente, réactivation, remise en
  // vente — cf. transitions.py), et AnnonceDetailAPIView (qui alimente ce
  // type via mapAnnonceToParcelle/mapAnnonceDetailToParcelle) est filtré en
  // dur sur .en_ligne(). Sur les 147 annonces en_ligne réelles au moment de
  // l'audit : 0 avec latitude/longitude null, et les 22 sans commune_geom
  // (legacy pré-2026-08-06) ont toutes un `commune` legacy qui fait
  // résoudre region sans exception. Le vrai besoin de nullabilité
  // (brouillon pas encore localisé) est déjà couvert ailleurs — par
  // AnnonceProprietaire et le type de depot-annonce.ts — pas ici.
  latitude: number;
  longitude: number;
  regionCode: string;
  regionNom: string;
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

// AgriScore courant.
//
// 2026-08-30 (hardening pré-soutenance) : l'API PUBLIQUE n'expose plus
// l'AgriScore — les seules valeurs jamais produites étaient des
// random.uniform() de seed. `scoreCourant` est donc toujours `null` en
// provenance du backend réel. Le type est conservé (dormant) : le composant
// ScoreBar, les blocs conditionnés par AGRISCORE_ACTIF (config/features.ts)
// et les mocks de dev (data/parcelles.ts) le référencent encore, et il
// reviendra quand un vrai moteur de calcul existera.
export type ScoreCourant = {
  scoreGlobal: number;
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
  prixM2: number; // MAD/m² — calculé (prix / surface en m²), valeur BRUTE non arrondie ; utiliser formatPrixM2() (lib/format.ts) pour l'affichage
  statut: StatutAnnonce;
  // Absent en liste (allégée) — renseigné en détail uniquement.
  datePublication: string | null;
  // Toujours présent (liste + détail) — sert de repli fiable pour le badge
  // "Nouveau", calculé front, jamais renvoyé par le back.
  createdAt: string;
  badge: string | null;
  parcelle: ParcelleTerrain;
  scoreCourant: ScoreCourant | null; // toujours null de l'API réelle (cf. ScoreCourant)
  photoPrincipale: string | null;
  photos: string[]; // vide en liste, rempli en détail (§4.4 — trié par ordre croissant)
  proprietaire?: { id: string; telephoneMasque: string | null };
  // Le vendeur a-t-il un numéro exploitable en lien WhatsApp ? Booléen
  // uniquement — le lien wa.me (qui contient le numéro) s'obtient via une
  // action authentifiée, GET /api/annonces/<id>/whatsapp/, jamais dans ce
  // DTO public (hardening 2026-08-30). Absent en liste (comme proprietaire).
  whatsappDisponible?: boolean;
  // L'emplacement exact est-il masqué ? Si true, la latitude/longitude
  // renvoyées par l'API sont déjà floutées côté serveur (~1 km, déterministe)
  // pour tout visiteur non-propriétaire — cf. annonces/serializers.py.
  // Sert seulement à adapter le libellé de la carte fiche.
  locConfidentielle?: boolean;
};
