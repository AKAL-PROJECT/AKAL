"""
Agent topo par défaut — altitude + pente via l'API Elevation d'Open-Meteo.

Open-Meteo Elevation (``api.open-meteo.com/v1/elevation``) sert le DEM
Copernicus GLO-90 **sans clé**, jusqu'à 100 points par appel. On interroge
une petite grille 3×3 (~90 m de pas) autour de la parcelle en une requête,
puis on dérive l'altitude au centre et la pente moyenne (%) par différences
centrées — même méthode que :mod:`agriscore.agents.topo_reel`, en plus
grossier (GLO-90 contre GLO-30).

C'est l'agent topo d'``AGENTS_DEFAUT`` : keyless, même hôte que l'agent
climat. :class:`~agriscore.agents.topo_reel.AgentTopoReel` (OpenTopography,
GLO-30, clé requise) reste disponible en passant ``agents=`` explicitement,
pour qui veut la résolution 30 m.

Résilience : ``_collecter_valeurs`` lève sur tout incident (timeout, API en
erreur, réponse malformée) ; la classe de base :class:`~agriscore.agents.base.Agent`
convertit en ``statut="indisponible"``. Aucune donnée écrite en base ici.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Sequence

import requests

from agriscore.agents._cache import TTL_STABLE
from agriscore.agents._config import METRES_PAR_DEGRE as _METRES_PAR_DEGRE
from agriscore.agents._config import timeout_http
from agriscore.agents.base import Agent

logger = logging.getLogger(__name__)

_URL = "https://api.open-meteo.com/v1/elevation"
_PAS_M = 90.0                     # pas de la grille ≈ maille GLO-90
_CONFIANCE_NOMINALE = 0.85        # DEM public, plus grossier que GLO-30 (0.9)


class AgentTopoOpenMeteo(Agent):
    dimension = "topo"
    source = "Copernicus GLO-90 / Open-Meteo Elevation"
    resolution_m = 90
    zone_tampon_m = 90
    mode = "reel"
    cache_ttl_s = TTL_STABLE        # le relief ne bouge pas

    def __init__(self, *, timeout_s: float | None = None,
                 session: requests.Session | None = None) -> None:
        self._timeout_s = timeout_s
        self._session = session

    def _collecter_valeurs(self, lat: float, lon: float) -> tuple[dict, float]:
        try:
            altitudes = self._telecharger(lat, lon)
            altitude, pente_pct = _altitude_et_pente(altitudes)
        except Exception as exc:  # noqa: BLE001 — tracé puis relancé (base → "indisponible")
            logger.warning("agent topo Open-Meteo indisponible en (%s, %s) : %s", lat, lon, exc)
            raise
        valeurs = {
            "altitude_m": round(altitude, 1),
            "pente_pct": round(pente_pct, 2),
            "dem": "GLO-90",
        }
        return valeurs, _CONFIANCE_NOMINALE

    def _telecharger(self, lat: float, lon: float) -> list[float]:
        points = _grille_points(lat, lon)
        client = self._session or requests
        reponse = client.get(
            _URL,
            params={
                "latitude": ",".join(f"{p_lat:.6f}" for p_lat, _ in points),
                "longitude": ",".join(f"{p_lon:.6f}" for _, p_lon in points),
            },
            timeout=timeout_http(self._timeout_s),
        )
        reponse.raise_for_status()
        altitudes = reponse.json().get("elevation")
        if not isinstance(altitudes, list) or len(altitudes) != len(points):
            raise ValueError(f"réponse Open-Meteo Elevation inattendue : {altitudes!r}")
        return altitudes


# ──────────────────────────────────────────────────────────────────────
# Géométrie de la grille + pente (fonctions pures)
# ──────────────────────────────────────────────────────────────────────

def _grille_points(lat: float, lon: float) -> list[tuple[float, float]]:
    """9 points (lat, lon) d'une grille 3×3 de pas ``_PAS_M`` autour du point.

    Ordre ligne par ligne : rangée 0 = nord, colonne 0 = ouest — le centre
    est donc l'indice 4.
    """
    d_lat = _PAS_M / _METRES_PAR_DEGRE
    d_lon = _PAS_M / (_METRES_PAR_DEGRE * max(math.cos(math.radians(lat)), 1e-6))
    return [
        (lat + d_r * d_lat, lon + d_c * d_lon)
        for d_r in (1, 0, -1)      # nord → sud
        for d_c in (-1, 0, 1)      # ouest → est
    ]


def _altitude_et_pente(altitudes: Sequence[float]) -> tuple[float, float]:
    """(altitude centrale, pente % moyenne) depuis les 9 altitudes de la grille.

    Pente par différences centrées, comme l'agent GLO-30 : la grille étant
    déjà à pas métrique constant (``_PAS_M`` en x comme en y, la correction
    de longitude est faite dans :func:`_grille_points`), le gradient se
    calcule directement en mètres.
    """
    if len(altitudes) != 9:
        raise ValueError(f"grille d'altitudes incomplète : {len(altitudes)}/9 points")
    if any(v is None or not isinstance(v, (int, float)) or v != v for v in altitudes):
        raise ValueError("altitude manquante ou non numérique dans la grille")

    g = [altitudes[0:3], altitudes[3:6], altitudes[6:9]]   # g[0] = rangée nord
    altitude = g[1][1]
    dz_dx = (g[1][2] - g[1][0]) / (2 * _PAS_M)             # est − ouest
    dz_dy = (g[0][1] - g[2][1]) / (2 * _PAS_M)             # nord − sud
    pente_pct = math.hypot(dz_dx, dz_dy) * 100.0
    return altitude, pente_pct
