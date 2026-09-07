"""
Interface commune de la couche COLLECTE du pipeline AgriScore.

Un agent collecte **une** dimension (sol, climat, NDVI, topo, accès) pour un
couple de coordonnées et renvoie un
:class:`~agriscore.agent_result.AgentResult`.

:meth:`Agent.collecter` est un squelette : il valide les coordonnées,
horodate, délègue la mesure à ``_collecter_valeurs`` (le seul point à
implémenter pour brancher un vrai agent) et — si cette mesure lève — renvoie
un résultat ``statut="indisponible"`` au lieu de propager l'exception. Un
agent en panne dégrade le score, il ne casse pas le pipeline (même principe
fail-open que le cache Redis, cf. docs/plans/2026-08-31-redis-fail-open.md).

Aucun réseau ici : la classe de base ne fait qu'assembler l'``AgentResult``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone

from agriscore.agent_result import DIMENSIONS, AgentResult
from agriscore.agents._cache import cle_cache, ecrire as _cache_ecrire, lire as _cache_lire


def valider_coordonnees(lat: object, lon: object) -> None:
    """``TypeError`` si non numérique, ``ValueError`` si hors des bornes terrestres."""
    for nom, valeur, borne in (("lat", lat, 90.0), ("lon", lon, 180.0)):
        if isinstance(valeur, bool) or not isinstance(valeur, (int, float)):
            raise TypeError(f"{nom} doit être un nombre, reçu {type(valeur).__name__}")
        if valeur != valeur or abs(valeur) > borne:  # NaN ou hors limites
            raise ValueError(f"{nom} = {valeur} hors des limites géographiques (±{borne:g})")


def horodatage_iso() -> str:
    """Instant présent en ISO 8601 UTC — l'horloge système, pas un appel réseau."""
    return datetime.now(timezone.utc).isoformat()


class Agent(ABC):
    """Base de tous les agents. Sous-classer, fixer les attributs, implémenter ``_collecter_valeurs``."""

    dimension: str = ""
    source: str = ""
    resolution_m: int | None = None
    zone_tampon_m: int = 0
    mode: str = "reel"
    #: TTL du cache Redis de la collecte (s). ``None`` = pas de cache
    #: (agents simulés : instantanés et déterministes).
    cache_ttl_s: int | None = None

    def collecter(self, lat: float, lon: float) -> AgentResult:
        """(lat, lon) → ``AgentResult``. Ne lève que sur des coordonnées invalides.

        Résultat « ok » servi depuis le cache Redis si une collecte récente
        existe pour ces coordonnées arrondies (cf. ``cache_ttl_s``).
        """
        valider_coordonnees(lat, lon)
        if self.dimension not in DIMENSIONS:
            raise ValueError(
                f"{type(self).__name__}.dimension invalide : {self.dimension!r} "
                f"(attendu : {', '.join(DIMENSIONS)})"
            )

        cle = cle_cache(self.dimension, lat, lon) if self.cache_ttl_s else None
        if cle is not None:
            en_cache = _cache_lire(cle)
            if isinstance(en_cache, AgentResult):
                return en_cache

        horodatage = horodatage_iso()
        try:
            valeurs, confiance = self._collecter_valeurs(lat, lon)
        except Exception:  # noqa: BLE001 — fail-open : agent en panne ⇒ dimension indisponible
            return self._resultat("indisponible", {}, 0.0, horodatage)

        resultat = self._resultat("ok", dict(valeurs), float(confiance), horodatage)
        if cle is not None:
            _cache_ecrire(cle, resultat, self.cache_ttl_s)  # jamais les échecs
        return resultat

    def _resultat(self, statut: str, valeurs: dict, confiance: float, horodatage: str) -> AgentResult:
        return AgentResult(
            dimension=self.dimension,
            statut=statut,
            mode=self.mode,
            valeurs=valeurs,
            source=self.source or type(self).__name__,
            date_collecte=horodatage,
            confiance=confiance,
            resolution_m=self.resolution_m,
            zone_tampon_m=self.zone_tampon_m,
        )

    @abstractmethod
    def _collecter_valeurs(self, lat: float, lon: float) -> tuple[dict, float]:
        """Mesure brute → ``(valeurs, confiance ∈ [0, 1])``.

        Lève si la donnée est indisponible : :meth:`collecter` rattrape et
        produit un résultat ``statut="indisponible"``.
        """


class AgentSimule(Agent):
    """Base des agents simulés : ``mode="simule"``, valeurs figées, zéro réseau."""

    mode = "simule"
