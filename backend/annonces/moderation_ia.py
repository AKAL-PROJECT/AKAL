"""
Signal de modération IA — palier 2 (branche feat/moderation-ia, 2026-10-01).

Complète (ne remplace jamais) le palier 1 pur-règles (moderation.py) : un
modèle multimodal local (Qwen2.5-VL via Ollama, cf. docker-compose.ia.yml)
évalue le texte (titre + description, darija/arabe/français) ET les
photos — deux signaux que le palier 1 écarte volontairement (NDVI et
variance de couleur photo auraient pénalisé de vrais vendeurs, cf. sa
docstring).

Désactivé par défaut (MODERATION_IA_ACTIVE=False, settings/base.py) :
appelé uniquement si ce flag est vrai (cf. site d'appel, serializers.py).
Jamais un rejet automatique — seulement un signal de plus pour la file
`en_attente`, même philosophie que moderation.py.

Résilient par construction : toute panne d'Ollama (service indisponible,
timeout, réponse malformée) renvoie un signal « non suspect » plutôt que
de lever — un modèle local optionnel sur une branche expérimentale ne doit
jamais bloquer un dépôt d'annonce.
"""
from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass, field

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# Borne la latence d'un appel déjà lent sur CPU (plusieurs secondes à
# quelques dizaines de secondes par image, cf. design doc) — au-delà, le
# gain de précision ne justifie pas l'attente supplémentaire pour le
# vendeur au moment du dépôt.
MAX_PHOTOS_ANALYSEES = 3

_PROMPT = """Tu es un modérateur pour AKAL, une plateforme marocaine de vente \
de terrains agricoles. Le titre et la description peuvent être en français, \
arabe standard ou darija marocain (dialecte, parfois écrit en caractères \
latins). Analyse le texte et les photos jointes et réponds UNIQUEMENT par un \
objet JSON de la forme {{"suspect": true|false, "raisons": ["..."]}} — \
suspect=true seulement si l'annonce ne décrit manifestement PAS un terrain \
agricole réel (contenu hors sujet, publicité pour autre chose, texte \
incohérent avec les photos, arnaque évidente). Ne juge jamais la qualité du \
terrain ou le prix, seulement la légitimité de l'annonce.

Titre : {titre}
Description : {description}"""


@dataclass
class SignalModerationIA:
    """Résultat du modèle — jamais une décision (cf. docstring du module)."""
    suspect: bool
    raisons: list[str] = field(default_factory=list)


def evaluer_signal_ia(titre: str, description: str, photos, *, session: requests.Session | None = None) -> SignalModerationIA:
    """Annonce suspecte selon le modèle local (texte + jusqu'à
    MAX_PHOTOS_ANALYSEES photos). `session` injectable pour les tests
    (mock), jamais un vrai appel réseau dans la suite automatisée — même
    motif que `session` sur AgentTopoReel (agriscore/agents/topo_reel.py).

    N'est appelée que si settings.MODERATION_IA_ACTIVE est vrai (garde
    côté appelant, serializers.py) — mais reste elle-même sans effet de
    bord si Ollama n'est pas joignable : renvoie un signal "non suspect"
    plutôt que de lever, voir docstring du module."""
    sess = session or requests

    images_b64 = []
    for photo in list(photos)[:MAX_PHOTOS_ANALYSEES]:
        if not photo.image:
            continue
        try:
            with photo.image.open('rb') as f:
                images_b64.append(base64.b64encode(f.read()).decode('ascii'))
        except OSError:
            # Photo illisible (ex. stockage objet temporairement
            # indisponible) — on continue l'analyse sans elle plutôt que
            # de faire échouer tout le signal pour une seule image.
            continue

    prompt = _PROMPT.format(titre=titre, description=description)

    try:
        reponse = sess.post(
            f"{settings.OLLAMA_URL}/api/generate",
            json={
                "model": settings.OLLAMA_MODERATION_MODEL,
                "prompt": prompt,
                "images": images_b64,
                "format": "json",
                "stream": False,
            },
            timeout=60,
        )
        reponse.raise_for_status()
        verdict = json.loads(reponse.json()["response"])
        return SignalModerationIA(
            suspect=bool(verdict.get("suspect", False)),
            raisons=[str(r) for r in verdict.get("raisons", [])],
        )
    except (requests.RequestException, KeyError, ValueError, TypeError) as exc:
        logger.warning("Signal de modération IA indisponible (%s) — annonce traitée sans ce signal.", exc)
        return SignalModerationIA(suspect=False, raisons=[])
