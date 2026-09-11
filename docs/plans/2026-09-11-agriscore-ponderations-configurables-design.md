# Rendre les pondérations de l'AgriScore configurables — design

Date : 2026-09-11
Contexte : suite à l'audit des 7 objectifs de stage (O4 — AgriScore),
constat que les poids des 5 dimensions (NDVI 25, Climat 20, Sol 20, Topo 20,
Accès 15) sont codés en dur dans `backend/agriscore/aggregation.py` — les
modifier exige un changement de code + un redéploiement. Objectif : un
administrateur métier doit pouvoir les ajuster depuis Django Admin, avec
validation que leur somme fasse 100, sans toucher au code.

## Décision structurante : forme du stockage

Deux options considérées :

- **(A, retenue)** étendre le singleton `ConfigurationAgriScore` existant
  (déjà admin-éditable, `actif` réel/simulé) avec 5 champs de poids.
  Validation "somme = 100" triviale et fiable via `Model.clean()`, qui voit
  les 5 valeurs d'un coup sur un seul objet.
- **(B, écartée)** un nouveau modèle `PonderationDimension`, une ligne par
  dimension, affiché en admin via `list_editable` pour coller littéralement
  à la maquette (tableau Dimension | Poids). Rejetée : la validation "somme
  des 5 lignes = 100" n'a pas d'équivalent simple à `Model.clean()` dans un
  formset de changelist Django — plus de code, plus fragile, pour un gain
  purement visuel. La fiabilité de la validation prime sur le rendu exact
  de la maquette.

L'admin affiche donc un formulaire à 5 champs empilés (pas un tableau),
sur le même écran "Configuration AgriScore" qu'aujourd'hui.

## Préserver la pureté du pipeline

`aggregation.py` est un module explicitement pur (aucun import Django,
docstring du fichier). `orchestrateur.py` l'est aussi (aucun import
Django). Seul `passeport.py` touche l'ORM — invariant déjà documenté dans
son propre docstring : *"C'est le seul module du pipeline qui touche à
l'ORM (via le flag) — le reste ... est du Python pur."*

Les poids suivent donc le même chemin que `agents`/`actif` aujourd'hui :
`ConfigurationAgriScore.poids_nominaux()` (nouveau classmethod, DB) →
`passeport.py` (lit la config) → `generer_passeport(..., poids_nominaux=...)`
(orchestrateur.py, transmet) → `agreger_scores(..., poids_nominaux=...)`
(aggregation.py, calcule). Aucun des deux modules purs ne gagne de
dépendance Django.

## Modèle (backend/agriscore/models.py)

5 `PositiveSmallIntegerField` (`poids_ndvi`, `poids_climat`, `poids_sol`,
`poids_topo`, `poids_acces`), défauts importés de
`aggregation.POIDS_NOMINAUX` (pas de magic numbers dupliqués). `clean()`
lève `ValidationError` si la somme ≠ 100 — Django l'affiche automatiquement
en haut du formulaire d'admin avant sauvegarde. `PositiveSmallIntegerField`
exclut déjà les valeurs négatives, pas de validator à ajouter pour ça.

Nouveau classmethod, même patron fail-safe que `pipeline_actif()` :
```python
@classmethod
def poids_nominaux(cls) -> dict[str, int]:
    try:
        c = cls.charger()
        return {"ndvi": c.poids_ndvi, "climat": c.poids_climat, "sol": c.poids_sol,
                "topo": c.poids_topo, "acces": c.poids_acces}
    except DatabaseError:
        logger.warning("ConfigurationAgriScore illisible — poids par défaut", exc_info=True)
        return dict(POIDS_NOMINAUX)
```

## Migration

`0002_configurationagriscore_poids.py` : 5 `AddField` avec les défauts
actuels (25/20/20/20/15). La ligne singleton existante est backfillée par
Django avec ces défauts — comportement de scoring inchangé au déploiement.

## `aggregation.py`

```python
POIDS_NOMINAUX: Mapping[str, int] = MappingProxyType({"ndvi": 25, "climat": 20, "sol": 20, "topo": 20, "acces": 15})

def agreger_scores(
    resultats: Iterable[AgentResult],
    sous_scores: Mapping[str, float],
    poids_nominaux: Mapping[str, int] = POIDS_NOMINAUX,
) -> dict:
    _valider_poids(poids_nominaux)  # nouveau — même style que _valider_sous_scores/_indexer
    ...  # corps inchangé
```
`MappingProxyType` : défense en profondeur contre une mutation accidentelle
du dict par défaut partagé, cohérent avec la rigueur déjà en place dans ce
fichier. `_valider_poids()` : exactement les 5 dimensions connues, somme à
100, sinon `ValueError` — deuxième barrière si une valeur invalide
franchissait malgré tout la validation admin. Rétrocompatible : les ~12
appels existants dans `tests.py` sans 3ᵉ argument continuent de fonctionner
à l'identique.

## `orchestrateur.py` / `passeport.py`

`generer_passeport()` gagne `poids_nominaux: Mapping[str, int] = POIDS_NOMINAUX`
(réexporté depuis `aggregation`), transmis tel quel à `agreger_scores()`.
`passeport_parcelle()` (passeport.py) lit `ConfigurationAgriScore.poids_nominaux()`
et le passe à `generer_passeport()`, à côté de la sélection `agents` déjà en
place.

## Admin (backend/agriscore/admin.py)

`ConfigurationAgriScoreAdmin` gagne un fieldset "Pondérations (doit
sommer à 100)" avec les 5 champs. Même écran singleton, pas de nouvel écran.
L'erreur de validation s'affiche automatiquement (comportement Django
standard), aucun code d'admin supplémentaire nécessaire pour ça.

## Tests (agriscore/tests.py)

- `agreger_scores()` avec des poids personnalisés valides (résultat
  recalculé à la main) ; `_valider_poids` rejette somme ≠ 100, dimension
  manquante, dimension inconnue.
- `ConfigurationAgriScoreTests` : `poids_nominaux()` reflète la DB ; repli
  sur les défauts si `charger()` lève `DatabaseError` (mock) ; `full_clean()`
  lève `ValidationError` si somme ≠ 100, passe si = 100 avec une répartition
  différente du défaut.
- `PasseportSelectionAgentsTests` : étendu pour vérifier que
  `passeport_parcelle()` transmet `poids_nominaux=ConfigurationAgriScore.poids_nominaux()`
  à `generer_passeport()` (même technique `@patch` + `call_args.kwargs`
  déjà utilisée pour `agents`).
