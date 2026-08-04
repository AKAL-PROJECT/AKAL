// Formateur monétaire partagé — `new Intl.NumberFormat("fr-MA")` était
// dupliqué dans 11 fichiers avant extraction (audit qualité technique,
// 2026-08-03). Une seule instance ici plutôt qu'une par module : construire
// un Intl.NumberFormat a un coût (résolution des données de locale) et
// l'objet est sans état, donc sûr à partager.
//
// Ne fixe pas le suffixe ("MAD", "MAD/ha", "MAD/m²", ou l'abréviation "k"
// dans SimulateurROI.tsx) — les appelants continuent de l'ajouter eux-mêmes,
// l'usage réel est trop varié pour un seul format figé.
export const formatMAD = new Intl.NumberFormat("fr-MA");
