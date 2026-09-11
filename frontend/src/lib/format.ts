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

// Formate un prix au m² pour l'affichage (audit final du 20/08, P4) —
// `Parcelle.prixM2` (types/parcelle.ts) est désormais la valeur BRUTE, non
// arrondie (cf. calculerPrixM2, lib/mapAnnonceToParcelle.ts) : un
// Math.round() appliqué avant affichage arrondissait à 0 tout prix réel
// inférieur à 0,5 MAD/m² (cas réel constaté sur une annonce scrapée — 170
// MAD pour 1,4 ha, soit ~0,012 MAD/m²) et affichait « 0 MAD/m² », lu comme
// « gratuit ». Seul ce point d'affichage change ; le calcul lui-même reste
// `prix / surface_m2`, jamais une valeur stockée en base.
export function formatPrixM2(prixM2: number): string {
  if (!Number.isFinite(prixM2) || prixM2 <= 0) return "0 MAD/m²";
  if (prixM2 < 1) return "< 1 MAD/m²";
  return `${formatMAD.format(Math.round(prixM2))} MAD/m²`;
}

// Distance courte : mètres sous 1 km, km avec une décimale au-delà. Rapatrié
// depuis data/passeportAgronomique.ts (le passeport réel affiche
// `distance_route_m`, cf. lib/passeport-presentation.ts).
export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return "—";
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}

// Prix abrégé pour les repères de la carte plein écran (pastilles posées sur
// la carte, /carte — design 1c) : 1 450 000 → « 1,45 M », 980 000 → « 980 k ».
// Volontairement court pour rester lisible sur le fond de carte ; le prix
// complet reste affiché partout ailleurs (tiroir, fiche de contact) via
// formatMAD.
export function formatPrixCourt(prix: number): string {
  if (!Number.isFinite(prix) || prix <= 0) return "—";
  if (prix >= 1_000_000) {
    const millions = prix / 1_000_000;
    const texte = millions.toFixed(millions < 10 ? 2 : 1).replace(/\.?0+$/, "");
    return `${texte.replace(".", ",")} M`;
  }
  if (prix >= 1_000) return `${Math.round(prix / 1_000)} k`;
  return formatMAD.format(prix);
}
