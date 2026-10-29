# Modération IA (palier 2) — texte darija/arabe/français + images

Date : 2026-10-01
Contexte : le palier 1 de modération (PR mergée, `backend/annonces/moderation.py`)
est un signal texte 100% règles, zéro coût, zéro dépendance externe —
délibérément limité au texte (titre + description), NDVI et photo écartés
car ils pénaliseraient de vrais vendeurs (jachère, saison sèche, photo de
champ visuellement uniforme). L'utilisateur demande maintenant un vrai
signal IA, texte (darija/arabe/français) + images, en complément du
palier 1 — jamais un remplacement.

Contrainte machine : poste de dev à 8 Go de RAM, donc impossible de faire
tourner un modèle local en permanence à côté du reste du stack docker
compose. D'où une branche dédiée, jamais mergée dans `main` tant que ce
n'est pas une décision à part — `main` reste utilisable sur une machine
contrainte.

## Décision de périmètre

- **Signal, jamais une décision** : même philosophie que le palier 1
  (`moderation.py`, docstring : « jamais de rejet automatique »). L'IA
  ajoute un motif à la file `en_attente`, un modérateur décide depuis
  `/moderation` (dashboard déjà livré, PR #49).
- **Un seul modèle pour texte + vision** : Qwen2.5-VL 3B via Ollama,
  plutôt que deux modèles séparés (vision + texte) — plus simple à
  orchestrer, un seul appel par annonce. Aucun modèle n'est entraîné
  spécifiquement sur le darija (surtout écrit en caractères latins/
  « arabizi ») : le support arabe (MSA) de Qwen est la meilleure
  approximation réaliste disponible en local sous contrainte de RAM —
  limite connue, pas une promesse de couverture parfaite du darija.
- **Déclenchement automatique au dépôt** (choix explicite de
  l'utilisateur, malgré la latence : un appel vision+texte sur CPU/8 Go
  peut prendre plusieurs secondes à quelques dizaines de secondes).
  Accepté tel quel sur cette branche expérimentale — pas de file de
  tâches en arrière-plan ajoutée (le projet n'en a aucune aujourd'hui,
  ça resterait hors périmètre de ce chantier).
- **`MODERATION_IA_ACTIVE`** (settings, défaut `False`) : le code existe
  sur la branche mais reste inactif par défaut, à activer explicitement
  pour tester — jamais par accident, même sur cette branche.

## Architecture

Nouveau module `backend/annonces/moderation_ia.py` (séparé de
`moderation.py`, qui reste le palier 1 pur-règles) :

```python
@dataclass
class SignalModerationIA:
    suspect: bool
    raisons: list[str]

def evaluer_signal_ia(titre: str, description: str, photos) -> SignalModerationIA:
    ...  # appelle le client Ollama (http://ollama:11434 en local, jamais
         # d'accès réseau externe), prompt structuré, verdict JSON attendu
         # {"suspect": bool, "raisons": [...]}
```

Hook point inchangé : `AnnonceEcritureSerializer.update()`
(`backend/annonces/serializers.py:853`), même garde que le palier 1
(uniquement au premier passage `brouillon → en_ligne`, jamais sur une
réactivation déjà modérée). Les deux signaux se combinent : `en_attente`
si l'un OU l'autre est suspect, `motif_moderation` concatène les raisons
des deux, préfixées (« Palier 1 » / « Palier 2 (IA) ») pour que le
modérateur sache lequel a parlé.

## Infra Docker (branche uniquement)

Nouveau `docker-compose.ia.yml` à la racine — **jamais fusionné dans**
`docker-compose.yml` ni `backend/docker-compose.yml` :

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    ports: ["11434:11434"]
    volumes: ["ollama_data:/root/.ollama"]
volumes:
  ollama_data:
```

Usage : `docker compose -f docker-compose.yml -f docker-compose.ia.yml up`
— un flag explicite, jamais le `docker compose up` habituel. Premier
démarrage : `docker compose exec ollama ollama pull qwen2.5vl:3b` à la
main (~2 Go, pas automatisé dans l'entrypoint — trop lourd pour un
démarrage normal).

## Tests

- `evaluer_signal_ia()` testée avec un client Ollama **mocké** (`unittest.
  mock.patch`) — jamais un vrai appel réseau dans la suite automatisée,
  qui doit rester rapide et tourner sans Ollama installé (CI, machine
  d'un autre contributeur).
- Test d'intégration séparé, skippable par défaut
  (`@skipUnless(os.environ.get('OLLAMA_TEST_REEL'), ...)`) pour une
  vérification manuelle ponctuelle avec le vrai modèle.

## Stratégie de branche

`feat/moderation-ia`, créée depuis `main` à jour. Rebasée sur `main`
**automatiquement à chaque reprise de ce travail** (pas d'automatisation
CI — une étape manuelle de l'assistant au début de chaque session sur
cette branche). Jamais de PR vers `main` tant que ce n'est pas une
décision explicite et séparée.

## Hors périmètre (explicitement écarté pour l'instant)

- File de tâches en arrière-plan (Celery/RQ) pour découpler la latence
  de l'appel IA du dépôt d'annonce — accepté tel quel (cf. décision ci-
  dessus), à reconsidérer si la latence s'avère rédhibitoire en usage réel.
- Rejet automatique par l'IA — jamais sans décision humaine.
- Fine-tuning ou modèle dédié darija — aucune option locale réaliste sous
  8 Go de RAM aujourd'hui.
