import type { Parcelle } from "@/types/parcelle";

// Transport client-only entre les pages qui alimentent la comparaison
// (catalogue, favoris, fiche annonce — P1-01 : Baroud veut pouvoir démarrer
// une comparaison depuis n'importe laquelle) et /comparateur — sessionStorage
// plutôt qu'un paramètre d'URL, pour éviter de refaire fetcher des Parcelle
// déjà chargées côté client (pas de nouvel endpoint). Portée volontairement
// limitée à l'onglet courant : ouvrir /comparateur directement (nouvel
// onglet, lien partagé) retombe proprement sur l'état vide plutôt que de
// tenter de deviner les parcelles.
export const COMPARATEUR_STORAGE_KEY = "akal:comparateur";

// 3 parcelles : au-delà, le tableau et la carte deviennent illisibles sur un
// écran standard (cf. ComparateurScreen.tsx) — même borne que l'ancien
// "X/3 sélectionnées" de BarreComparateur.tsx, désormais centralisée ici.
export const COMPARATEUR_MAX = 3;

export function lireParcellesComparees(): Parcelle[] {
  try {
    const brut = sessionStorage.getItem(COMPARATEUR_STORAGE_KEY);
    if (!brut) return [];
    const parsed = JSON.parse(brut);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function ecrireParcellesComparees(parcelles: Parcelle[]): void {
  try {
    sessionStorage.setItem(COMPARATEUR_STORAGE_KEY, JSON.stringify(parcelles));
  } catch {
    // sessionStorage indisponible (navigation privée stricte, quota plein) —
    // dégrade en silence : la comparaison reste utilisable pour le rendu en
    // cours, simplement pas garantie de survivre à une navigation.
  }
}
