// Limiteur de concurrence pour les appels vers GET /api/parcelles/<id>/passeport/.
//
// Le pipeline AgriScore peut déclencher jusqu'à 5 appels vers des API
// externes (Copernicus, Open-Meteo, SoilGrids, OSRM) sur cache froid — le
// catalogue affiche 12 à 50 cartes à la fois, un fetch naïf par carte au
// montage risquerait donc de lancer jusqu'à 50 pipelines en parallèle.
//
// File d'attente FIFO in-memory, à l'échelle du module (donc partagée par
// TOUTES les instances de useAgriScoreResume montées sur une même page —
// catalogue, fiche, comparateur confondus) : au plus MAX_CONCURRENT tâches
// en vol, le reste patiente et démarre dès qu'une place se libère.
//
// Ne remplace pas le cache Redis + verrou anti-emballement déjà en place
// côté back (backend/agriscore/api_views.py) — les deux mécanismes sont
// complémentaires : celui-ci borne le nombre de requêtes HTTP sortantes
// depuis UN navigateur, l'autre protège le serveur contre N navigateurs.
//
// MAX_CONCURRENT = 5 : aligné sur AGRISCORE_HTTP_TIMEOUT_S côté back (un
// pipeline à froid tourne en ~3-5 s) — assez pour que les cartes visibles à
// l'écran arrivent vite, assez peu pour ne jamais tenter plus de 5 pipelines
// (25 requêtes sortantes max) en même temps.
const MAX_CONCURRENT = 5;

let enVol = 0;
const attente: (() => void)[] = [];

export function planifier<T>(tache: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const lancer = () => {
      enVol++;
      tache()
        .then(resolve, reject)
        .finally(() => {
          enVol--;
          attente.shift()?.();
        });
    };
    if (enVol < MAX_CONCURRENT) lancer();
    else attente.push(lancer);
  });
}
