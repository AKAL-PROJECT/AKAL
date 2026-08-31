// Indicateurs de fonctionnalités dont l'UI est temporairement masquée sans
// que le composant, les types ou les données sous-jacentes soient touchés —
// réactivation par un seul booléen, pas par restauration depuis l'historique
// git. Ne pas en déduire une infra de feature flags générale : un fichier
// plat suffit tant qu'il n'y a qu'une poignée d'indicateurs.

// AgriScore hors périmètre produit actuel (Phase 3, 2026-08) — décision
// produit, pas une limite technique. Pour réactiver : repasser ce booléen à
// `true`, c'est tout. Rien d'autre à modifier : chaque point d'affichage
// ci-dessous est déjà écrit et se réaffiche automatiquement.
//
// Ce que ce flag NE touche PAS (déjà en place, jamais désactivé) :
//   - le composant ScoreBar (src/components/parcelles/ScoreBar.tsx)
//   - le champ scoreCourant (src/types/parcelle.ts) et son alimentation
//     depuis l'API/les mocks (src/data/parcelles.ts, lib/mapAnnonceToParcelle.ts)
//
// Ce que ce flag conditionne (grep "AGRISCORE_ACTIF" pour la liste à jour) :
//   - CardParcelle.tsx        : barre de score sous le titre, dans la grille catalogue
//   - CardParcelleSkeleton.tsx : ligne fantôme correspondante (garder aligné avec CardParcelle)
//   - FicheParcelle.tsx       : carte "AgriScore" dédiée sous le titre
//   - ComparateurScreen.tsx   : ligne "AgriScore" du tableau de comparaison
//   - app/page.tsx (Home)     : chip du panneau Hero — bascule entre la variante
//                               ScoreBar (flag actif) et une variante région/statut
//                               foncier (flag inactif) ; les deux sont écrites, aucune
//                               à recréer
//
// Non couvert par ce flag, à revoir manuellement si le score revient :
//   - la mention "AgriScore" dans la copy "Comment ça marche" (Home) a été
//     remplacée par "prix au m²" — remettre la mention si souhaité, ce n'est
//     pas un simple bascule de flag (texte éditorial, pas un composant)
export const AGRISCORE_ACTIF = false;

// Bandeau « données de démonstration » (hardening pré-soutenance, 2026-08-30).
//
// L'environnement de soutenance ne sert que le jeu interne (seed_demo /
// seed_parcelles, AKAL_DATASET='simulated' figé en prod) : des annonces
// d'exemple créées par l'équipe, jamais de vrais dépôts de vendeurs ni les
// annonces scrapées. Ce bandeau le dit clairement sur le catalogue et la
// fiche, pour que personne — jury compris — ne prenne ces annonces pour de
// vraies offres. À repasser à `false` le jour où le catalogue contient de
// vraies annonces d'utilisateurs.
export const BANNIERE_DEMO = true;
