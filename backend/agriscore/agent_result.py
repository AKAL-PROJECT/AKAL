"""
:class:`AgentResult` — contrat de sortie unique des agents du pipeline AgriScore.

Chaque agent de collecte (sol, climat, NDVI, topo, accès) renvoie exactement
un ``AgentResult``. L'objet est **immuable** (``frozen=True``) : une fois
produit il traverse le pipeline sans être modifié — l'agrégateur de score le
lit, ne le réécrit jamais. Toute correction passe par un nouvel objet.

Le dictionnaire ``valeurs`` est libre : sa forme dépend de la dimension
(ex. ``{"ndvi_moyen": 0.62}`` pour ``ndvi``, ``{"type_sol": "argileux",
"ph_eau": 7.1}`` pour ``sol``). Les consommateurs itèrent dynamiquement
dessus, ils ne typent jamais ses clés en dur — même règle que ``sous_scores``
côté API (cf. contrat de données §3.5).

Construction en arguments nommés uniquement (``kw_only``) : neuf champs
positionnels seraient une source d'erreurs silencieuses dans un objet
partagé par tout le pipeline.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, fields
from datetime import datetime
from typing import Any, Literal, get_args

# Enums du contrat. Les tuples dérivés servent à la validation runtime :
# `Literal` ne vérifie rien à l'exécution, seulement au type-check.
Dimension = Literal["sol", "climat", "ndvi", "topo", "acces"]
Statut = Literal["ok", "indisponible"]
Mode = Literal["reel", "simule"]

DIMENSIONS: tuple[str, ...] = get_args(Dimension)
STATUTS: tuple[str, ...] = get_args(Statut)
MODES: tuple[str, ...] = get_args(Mode)


def _valider_iso8601(valeur: object) -> None:
    """Rejette tout ce qui n'est pas une chaîne ISO 8601 analysable."""
    if not isinstance(valeur, str):
        raise TypeError(
            f"date_collecte doit être une chaîne ISO 8601, reçu {type(valeur).__name__}"
        )
    try:
        datetime.fromisoformat(valeur)
    except ValueError as exc:
        raise ValueError(
            f"date_collecte n'est pas au format ISO 8601 : {valeur!r}"
        ) from exc


def _est_entier(valeur: object) -> bool:
    """`True` seulement pour un vrai entier — `bool` est un `int` en Python."""
    return isinstance(valeur, int) and not isinstance(valeur, bool)


@dataclass(frozen=True, slots=True, kw_only=True)
class AgentResult:
    """Résultat normalisé et immuable produit par un agent de collecte."""

    dimension: Dimension
    statut: Statut
    mode: Mode
    valeurs: dict[str, Any]
    source: str
    date_collecte: str  # ISO 8601
    confiance: float  # 0.0–1.0
    resolution_m: int | None
    zone_tampon_m: int

    def __post_init__(self) -> None:
        if self.dimension not in DIMENSIONS:
            raise ValueError(
                f"dimension invalide : {self.dimension!r} "
                f"(attendu : {', '.join(DIMENSIONS)})"
            )
        if self.statut not in STATUTS:
            raise ValueError(
                f"statut invalide : {self.statut!r} (attendu : {', '.join(STATUTS)})"
            )
        if self.mode not in MODES:
            raise ValueError(
                f"mode invalide : {self.mode!r} (attendu : {', '.join(MODES)})"
            )
        if not isinstance(self.valeurs, dict):
            raise TypeError(
                f"valeurs doit être un dict, reçu {type(self.valeurs).__name__}"
            )
        if not isinstance(self.source, str) or not self.source:
            raise ValueError("source doit être une chaîne non vide")
        _valider_iso8601(self.date_collecte)
        if isinstance(self.confiance, bool) or not isinstance(self.confiance, (int, float)):
            raise TypeError("confiance doit être un nombre")
        if not 0.0 <= self.confiance <= 1.0:
            raise ValueError(
                f"confiance hors bornes : {self.confiance} (attendu : 0.0–1.0)"
            )
        if self.resolution_m is not None:
            if not _est_entier(self.resolution_m) or self.resolution_m <= 0:
                raise ValueError(
                    f"resolution_m doit être un entier > 0 ou None, reçu {self.resolution_m!r}"
                )
        if not _est_entier(self.zone_tampon_m) or self.zone_tampon_m < 0:
            raise ValueError(
                f"zone_tampon_m doit être un entier >= 0, reçu {self.zone_tampon_m!r}"
            )

    def to_dict(self) -> dict[str, Any]:
        """
        Sérialise en dict JSON — la forme sous laquelle l'objet transite dans
        le pipeline puis vers l'endpoint interne.

        Le passage par ``json`` garantit deux choses : la sortie est
        réellement JSON-compatible (échec ici, tôt, plutôt que chez
        l'appelant), et ``valeurs`` est une copie défensive — muter le dict
        renvoyé ne touche pas l'``AgentResult`` source, par ailleurs figé.

        Lève ``TypeError`` si ``valeurs`` contient un type non JSON
        (``Decimal``, ``datetime``, ``set``…) : le contrat impose des
        primitives JSON.
        """
        donnees = {champ.name: getattr(self, champ.name) for champ in fields(self)}
        return json.loads(json.dumps(donnees))
