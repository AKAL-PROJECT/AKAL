"""
Cache des collectes d'agents — réutilise ``CACHES['default']`` (django-redis).

Une parcelle déjà interrogée ne retape pas les API : la clé est
``agriscore:agent:<dimension>:<lat arrondie>:<lon arrondie>`` et la valeur
l'``AgentResult`` « ok ». Les échecs ne sont **jamais** mis en cache : un
agent tombé en ``indisponible`` réessaie au passage suivant.

Redis reste une optimisation, jamais une dépendance : ``CACHES['default']``
a ``IGNORE_EXCEPTIONS=True`` (cf. settings, docs/plans/2026-08-31-redis-fail-open.md)
— Redis injoignable ⇒ :func:`lire` renvoie ``None``, :func:`ecrire` est un
no-op, la collecte retape simplement la source.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

#: Arrondi des coordonnées dans la clé. 3 décimales ≈ 110 m : deux points
#: d'une même parcelle partagent l'entrée. Les sources sont de toute façon
#: plus grossières (SoilGrids 250 m, ERA5 ≈ 11 km).
PRECISION_COORD = 3

#: TTL par stabilité de la donnée. Sol, relief et normale climatique sont
#: quasi invariants ; le NDVI suit une fenêtre glissante de 12 mois → court.
TTL_STABLE = 60 * 60 * 24 * 30    # 30 j — sol, topo, climat
TTL_MOYEN = 60 * 60 * 24 * 7      # 7 j  — accès (une route peut être créée)
TTL_COURT = 60 * 60 * 24          # 24 h — NDVI


def cle_cache(dimension: str, lat: float, lon: float) -> str:
    return (
        f"agriscore:agent:{dimension}:"
        f"{round(lat, PRECISION_COORD)}:{round(lon, PRECISION_COORD)}"
    )


def lire(cle: str):
    try:
        from django.core.cache import cache

        return cache.get(cle)
    except Exception:  # noqa: BLE001 — cache HS : on retape la source
        logger.warning("cache agent indisponible en lecture (%s)", cle, exc_info=True)
        return None


def ecrire(cle: str, valeur, ttl_s: int) -> None:
    try:
        from django.core.cache import cache

        cache.set(cle, valeur, ttl_s)
    except Exception:  # noqa: BLE001
        logger.warning("cache agent indisponible en écriture (%s)", cle, exc_info=True)
