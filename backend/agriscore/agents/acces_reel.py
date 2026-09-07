"""
Agent accès RÉEL — distance à la route la plus proche via OSRM / OpenStreetMap.

Interroge le service ``nearest`` d'OSRM (gratuit, sans clé, réseau routier
OpenStreetMap) : il projette le point sur la route carrossable la plus
proche et renvoie la distance de rattachement en mètres.

Résilience : tout incident (timeout, API en erreur, ``code != "Ok"``,
aucun point de rattachement) est tracé puis relancé ; la classe de base
convertit en ``statut="indisponible"``.
"""

from __future__ import annotations

import logging

import requests

from agriscore.agents._cache import TTL_MOYEN
from agriscore.agents._config import timeout_http
from agriscore.agents.base import Agent

logger = logging.getLogger(__name__)

_URL = "https://router.project-osrm.org/nearest/v1/driving/"
_CONFIANCE_NOMINALE = 0.75       # exact si OSM couvre la zone ; couverture rurale variable


class AgentAccesReel(Agent):
    dimension = "acces"
    source = "OSRM nearest / OpenStreetMap"
    resolution_m = None            # réseau vectoriel, pas de maille
    zone_tampon_m = 0
    mode = "reel"
    cache_ttl_s = TTL_MOYEN        # une route peut être créée / reclassée

    def __init__(self, *, timeout_s: float | None = None,
                 session: requests.Session | None = None) -> None:
        self._timeout_s = timeout_s
        self._session = session

    def _collecter_valeurs(self, lat: float, lon: float) -> tuple[dict, float]:
        try:
            donnees = self._telecharger(lat, lon)
            distance_m, nom = _extraire(donnees)
        except Exception as exc:  # noqa: BLE001 — tracé puis relancé (base → "indisponible")
            logger.warning("agent accès réel indisponible en (%s, %s) : %s", lat, lon, exc)
            raise
        valeurs = {
            "distance_route_m": round(distance_m, 1),
            "route_nom": nom or "route non nommée",
            "source_reseau": "OpenStreetMap",
        }
        return valeurs, _CONFIANCE_NOMINALE

    def _telecharger(self, lat: float, lon: float) -> dict:
        client = self._session or requests
        reponse = client.get(
            f"{_URL}{lon:.6f},{lat:.6f}",
            params={"number": 1},
            timeout=timeout_http(self._timeout_s),
        )
        reponse.raise_for_status()
        return reponse.json()


def _extraire(donnees: dict) -> tuple[float, str]:
    if donnees.get("code") != "Ok":
        raise ValueError(f"OSRM code={donnees.get('code')!r}")
    points = donnees.get("waypoints") or []
    if not points:
        raise ValueError("OSRM : aucun point de rattachement")
    distance = points[0].get("distance")
    if distance is None or distance < 0:
        raise ValueError(f"OSRM : distance de rattachement invalide ({distance})")
    return float(distance), points[0].get("name") or ""
