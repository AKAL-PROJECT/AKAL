// Indicateurs de fonctionnalités dont l'UI est temporairement masquée sans
// que le composant, les types ou les données sous-jacentes soient touchés —
// réactivation par un seul booléen, pas par restauration depuis l'historique
// git. Ne pas en déduire une infra de feature flags générale : un fichier
// plat suffit tant qu'il n'y a qu'une poignée d'indicateurs.

// AGRISCORE_ACTIF a été retiré le 2026-09-11 (réintégration de l'AgriScore
// au catalogue) : il masquait l'ancien mécanisme (composant ScoreBar, champ
// `scoreCourant`, jamais alimenté par un vrai calcul — cf. historique git).
// Le vrai potentiel agronomique vit dans `agriscore/` (backend) et s'affiche
// désormais partout via AgriScoreResume (components/parcelles/passeport/),
// sans flag : la donnée est réelle, plus de raison de la masquer.

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
