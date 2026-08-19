// Formateur monétaire partagé — `new Intl.NumberFormat("fr-MA")` était
// dupliqué dans 11 fichiers avant extraction (audit qualité technique,
// 2026-08-03). Une seule instance ici plutôt qu'une par module : construire
// un Intl.NumberFormat a un coût (résolution des données de locale) et
// l'objet est sans état, donc sûr à partager.
//
// Ne fixe pas le suffixe ("MAD", "MAD/ha", "MAD/m²", ou une abréviation "k"
// ponctuelle) — les appelants continuent de l'ajouter eux-mêmes, l'usage
// réel est trop varié pour un seul format figé.
export const formatMAD = new Intl.NumberFormat("fr-MA");

// Conversion hectares → m² (1 ha = 10 000 m², unité SI sans ambiguïté —
// contrairement à des unités traditionnelles comme le kheddam, dont la
// valeur varie selon la région et n'est délibérément pas implémentée ici :
// afficher un chiffre "précis" mais faux pour la région de l'utilisateur
// serait pire que ne pas convertir du tout). Même arrondi/locale que
// l'usage préexistant dans BlocCaracteristiques.tsx (fiche annonce) —
// extrait ici pour qu'EtapeInfosGenerales.tsx (aperçu temps réel au dépôt
// d'annonce, audit du 19/08) réutilise exactement le même calcul plutôt
// que de le dupliquer.
export function hectaresVersM2(ha: number): string {
  return Math.round(ha * 10_000).toLocaleString("fr-MA");
}
