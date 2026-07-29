import type { Parcelle } from "@/types/parcelle";

// Transport client-only entre la barre de comparaison (catalogue) et la page
// /comparateur — sessionStorage plutôt qu'un paramètre d'URL, pour éviter de
// refaire fetcher des Parcelle déjà chargées par le catalogue (pas de
// nouvel endpoint). Portée volontairement limitée à l'onglet courant :
// ouvrir /comparateur directement (nouvel onglet, lien partagé) retombe
// proprement sur l'état vide plutôt que de tenter de deviner les parcelles.
export const COMPARATEUR_STORAGE_KEY = "akal:comparateur";

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
