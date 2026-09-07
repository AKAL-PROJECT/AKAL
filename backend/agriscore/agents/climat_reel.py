"""
Agent climat RÉEL — pluviométrie annuelle moyenne via Open-Meteo (archive ERA5).

Interroge l'API archive d'Open-Meteo (gratuite, sans clé) sur la normale
climatique 1991–2020, moyenne les précipitations quotidiennes et les
ramène à une pluviométrie annuelle (mm). Récupère aussi la température
moyenne à titre indicatif.

Résilience : tout incident (timeout, API en erreur, série vide) est tracé
puis relancé ; la classe de base :class:`~agriscore.agents.base.Agent`
convertit en ``statut="indisponible"``. Jamais d'exception vers le pipeline.
"""

from __future__ import annotations

import logging

import requests

from agriscore.agents._cache import TTL_STABLE
from agriscore.agents._config import timeout_http
from agriscore.agents.base import Agent

logger = logging.getLogger(__name__)

_URL = "https://archive-api.open-meteo.com/v1/archive"
_DEBUT, _FIN = "1991-01-01", "2020-12-31"
_JOURS_PAR_AN = 365.25
_CONFIANCE_NOMINALE = 0.85


class AgentClimatReel(Agent):
    dimension = "climat"
    source = "Open-Meteo archive (ERA5), normale 1991-2020"
    resolution_m = 11_000        # maille ERA5 ≈ 11 km
    zone_tampon_m = 0            # valeur au point (maille du modèle)
    mode = "reel"
    cache_ttl_s = TTL_STABLE     # normale 30 ans : stable au mois près

    def __init__(self, *, timeout_s: float | None = None,
                 session: requests.Session | None = None) -> None:
        self._timeout_s = timeout_s
        self._session = session

    def _collecter_valeurs(self, lat: float, lon: float) -> tuple[dict, float]:
        try:
            donnees = self._telecharger(lat, lon)
            pluvio_mm, temp_c, couverture = _agreger(donnees)
        except Exception as exc:  # noqa: BLE001 — tracé puis relancé (base → "indisponible")
            logger.warning("agent climat réel indisponible en (%s, %s) : %s", lat, lon, exc)
            raise
        valeurs = {
            "pluviometrie_mm": round(pluvio_mm, 1),
            "temperature_moyenne_c": None if temp_c is None else round(temp_c, 1),
            "periode": "1991-2020",
            "source_donnees": "ERA5 / Open-Meteo",
        }
        return valeurs, round(_CONFIANCE_NOMINALE * couverture, 2)

    def _telecharger(self, lat: float, lon: float) -> dict:
        client = self._session or requests
        reponse = client.get(
            _URL,
            params={
                "latitude": lat,
                "longitude": lon,
                "start_date": _DEBUT,
                "end_date": _FIN,
                "daily": "precipitation_sum,temperature_2m_mean",
                "timezone": "UTC",
            },
            timeout=timeout_http(self._timeout_s),
        )
        reponse.raise_for_status()
        return reponse.json()


def _agreger(donnees: dict) -> tuple[float, float | None, float]:
    """(pluviométrie annuelle mm, température moyenne °C | None, couverture 0–1)."""
    daily = donnees.get("daily") or {}
    pluies = daily.get("precipitation_sum")
    if not pluies:
        raise ValueError("série de précipitations vide")

    valides = [p for p in pluies if p is not None]
    if not valides:
        raise ValueError("aucune valeur de précipitation exploitable")
    couverture = len(valides) / len(pluies)
    pluvio_annuelle = (sum(valides) / len(valides)) * _JOURS_PAR_AN  # robuste aux jours manquants

    temperatures = [t for t in (daily.get("temperature_2m_mean") or []) if t is not None]
    temp_moyenne = sum(temperatures) / len(temperatures) if temperatures else None
    return pluvio_annuelle, temp_moyenne, couverture
