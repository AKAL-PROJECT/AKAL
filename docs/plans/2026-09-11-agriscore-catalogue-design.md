# Réintégrer l'AgriScore dans le catalogue — design

Date : 2026-09-11
Contexte : suite à l'audit des 7 objectifs de stage (O4 — AgriScore),
constat que le pipeline de calcul (`backend/agriscore/`) est réel, pondéré,
testé et robuste aux données manquantes, mais que le score n'était visible
que via une page Passeport dédiée (`/parcelles/[slug]/passeport`), jamais
au niveau du catalogue. Demande produit : afficher un résumé compact sur la
carte catalogue, cliquable vers le passeport complet, pour créer une
continuité "Recherche → comparaison → score → compréhension → décision".

## Périmètre

- Carte catalogue (`CardParcelle.tsx`) : résumé compact, une ligne.
- Fiche annonce (`FicheParcelle.tsx`) : résumé détaillé (score + 5 sous-
  scores), fusionné dans le bloc "Passeport Agronomique" existant plutôt
  qu'empilé à côté.
- Comparateur (`ComparateurScreen.tsx`) : la ligne "AgriScore" existante
  (morte, branchée sur `scoreCourant` qui n'existe plus côté backend) est
  rebranchée sur les vraies données, avec conservation du surlignage
  "meilleure valeur" déjà présent sur les autres lignes du tableau.
- Nettoyage : suppression complète de l'ancien mécanisme mort
  (`AGRISCORE_ACTIF`, `ScoreBar`, `scoreCourant`/`ScoreCourant`).

Hors périmètre (décision explicite, évite le scope creep) : le chip
AgriScore du hero de la Home (`app/page.tsx`) n'utilisait déjà que la
variante "région/statut foncier" en pratique (flag toujours `false`) — on
ne l'étend pas ici, on retire juste la branche morte qui référençait
`AGRISCORE_ACTIF`.

## Problème central : coût du pipeline

`GET /api/parcelles/<id>/passeport/` peut déclencher jusqu'à 5 appels vers
des API externes (Copernicus, Open-Meteo, SoilGrids, OSRM) sur cache froid
(~3-5 s). Une grille catalogue affiche 12 à 50 cartes à la fois : un fetch
naïf par carte au montage risque de déclencher autant de pipelines en
parallèle.

Backend déjà en place et suffisant, non modifié par ce chantier : cache
Redis 12 h par parcelle (`TTL_PASSEPORT_S`), verrou anti-emballement par
parcelle (429 si calcul concurrent), fail-open sur cache/verrou HS. Aucun
nouvel endpoint créé — on réutilise `/passeport/` tel quel.

**Décision : approche A — fetch paresseux + concurrence limitée côté
client.** Pas de pré-calcul en tâche de fond (pas de Celery/RQ/cron dans la
stack, l'ajouter serait disproportionné) ni de nouvel endpoint batché (ne
résout pas le vrai problème, juste le nombre de requêtes HTTP). Un
limiteur de concurrence simple, partagé au niveau module, plafonne à 5
fetches simultanés quel que soit le nombre de cartes montées.

## Composants

### `lib/agriscore-concurrency.ts` (nouveau)

File d'attente FIFO in-memory, module-scope :

```ts
const MAX_CONCURRENT = 5;
let enVol = 0;
const attente: (() => void)[] = [];

export function planifier<T>(tache: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const lancer = () => {
      enVol++;
      tache().then(resolve, reject).finally(() => {
        enVol--;
        attente.shift()?.();
      });
    };
    enVol < MAX_CONCURRENT ? lancer() : attente.push(lancer);
  });
}
```

### `hooks/useAgriScoreResume.ts` (nouveau)

```ts
type EtatScore =
  | { statut: "chargement" }
  | { statut: "ok"; passeport: Passeport }
  | { statut: "indisponible"; raison: RaisonIndisponible };

function useAgriScoreResume(parcelleId: string): EtatScore
```

Enveloppe `getPasseport()` (`lib/passeport-api.ts`, inchangé) via
`planifier()`. Annulation au démontage (pas de `setState` après unmount),
même garde que `PasseportAgronomiqueScreen`. **Pas de retry automatique**
sur les usages compacts (carte/fiche/comparateur) — contrairement à la page
Passeport qui a son bouton "Réessayer" : évite un possible effet de
cascade de retries sur une grille de 50 cartes.

### `components/parcelles/passeport/AgriScoreResume.tsx` (nouveau)

```ts
type Props = {
  parcelleId: string;
  slug: string;
  accesEau: AccesEau | null;
  variante?: "compact" | "detaille"; // défaut "compact"
  onScore?: (score: number | null) => void; // comparateur uniquement
};
```

- Enveloppe systématiquement le bloc dans `<Link href="/parcelles/{slug}/passeport">`,
  dans les 3 états — la destination ne dépend pas du résultat du fetch.
- `compact` : une ligne `🌱 AgriScore {round(scoreGlobal)}/100 — {verdict(...)}`,
  couleur pilotée par `bandeScore().ton` (réutilise `lib/passeport-presentation.ts`,
  aucune nouvelle logique de seuils).
- `detaille` : la ligne ci-dessus + une ligne de sous-scores
  (`LIBELLE_DIMENSION[cle].court: {sousScore}`), une entrée par dimension
  `ok`, omise si `indisponible`.
- États : `chargement` (barre grise pulsée, hauteur figée), `ok` avec
  `scoreGlobal: null` ou `indisponible` (texte discret "Analyse agronomique
  indisponible", gris tertiaire, jamais de chiffre inventé), `ok` avec score.
- `onScore` : appelé une fois le fetch résolu (score ou `null`), sert
  uniquement au comparateur pour remonter la valeur au parent (surlignage
  "meilleure valeur").

## Intégration par écran

**`CardParcelle.tsx`** : remplace `{AGRISCORE_ACTIF && <ScoreBar ... />}`
par `<AgriScoreResume parcelleId={a.parcelle.id} slug={a.slug} accesEau={a.parcelle.accesEau} />`.
Le lien imbriqué suit le même traitement que le bouton favori / la case
"Comparer" déjà présents dans ce composant (z-index élevé + `stopPropagation`,
pour coexister avec le lien plein-carte vers la fiche).

**`CardParcelleSkeleton.tsx`** : la ligne fantôme correspondante devient
inconditionnelle (l'espace est désormais toujours réservé).

**`FicheParcelle.tsx`** : suppression du bloc `{AGRISCORE_ACTIF && (...)}`
(ancien "AgriScore" séparé, mort). `<AgriScoreResume variante="detaille" ... />`
inséré à l'intérieur du bloc "Passeport Agronomique" existant (style
certificat), au-dessus du bouton "Analyser le potentiel" — un seul bloc
visuel, pas deux empilés.

**`ComparateurScreen.tsx`** : la ligne `LIGNES` "AgriScore" (actuellement
`valeur: (p) => p.scoreCourant?.scoreGlobal ?? null`, `render` avec
`ScoreBar`) devient : `render` → `<AgriScoreResume variante="detaille" ... onScore={...} />`
par cellule ; `valeur` → lecture d'un état `scores: Record<string, number|null>`
levé dans `ComparateurScreen`, peuplé par les callbacks `onScore` des 3
cellules (`COMPARATEUR_MAX = 3`). Garde le surlignage "meilleure valeur"
cohérent avec les autres lignes du tableau (prix, surface…).

## Nettoyage du code mort

Supprimés intégralement (plus de flag "au cas où" — la donnée réelle
remplace la donnée factice, pas de raison de garder les deux) :

- `AGRISCORE_ACTIF` (`config/features.ts`)
- `ScoreBar.tsx`
- Le type `ScoreCourant` et le champ `scoreCourant` (`types/parcelle.ts`,
  `data/parcelles.ts`, `lib/mapAnnonceToParcelle.ts` + son test)
- `agriScoreLegende()` (`FicheParcelle.tsx`), orpheline après suppression
  du bloc `AGRISCORE_ACTIF`

## Tests

- `agriscore-concurrency.test.ts` : respecte `MAX_CONCURRENT`, dépile sur
  succès et sur échec.
- `useAgriScoreResume.test.ts` : les 3 états, cleanup au démontage (même
  gabarit que les tests déjà existants de `PasseportAgronomiqueScreen`).
- `AgriScoreResume.test.tsx` : 3 états × 2 variantes, `href` correct,
  `stopPropagation` dans un contexte de lien imbriqué.
- `mapAnnonceToParcelle.test.ts` : mis à jour (retrait des assertions sur
  `scoreCourant`).
