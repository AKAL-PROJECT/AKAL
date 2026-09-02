"""
Agent sol RÉEL — pH et texture via SoilGrids v2.0 (ISRIC).

Interroge l'API REST SoilGrids (gratuite, sans clé) pour l'horizon 0–5 cm :
pH eau, et fractions argile / sable / limon dont on déduit une classe de
texture compatible avec :data:`agriscore.interpretation.TEXTURES`.

Résilience : tout incident (timeout, API en erreur, propriété absente, pH
aberrant) est tracé puis relancé ; la classe de base convertit en
``statut="indisponible"``.
"""

from __future__ import annotations

import logging

import requests

from agriscore.agents._cache import TTL_STABLE
from agriscore.agents._config import timeout_http
from agriscore.agents.base import Agent

logger = logging.getLogger(__name__)

_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query"
_PROFONDEUR = "0-5cm"
_CONFIANCE_NOMINALE = 0.70       # produit modélisé à 250 m


class AgentSolReel(Agent):
    dimension = "sol"
    source = "SoilGrids v2.0 (ISRIC), horizon 0-5 cm"
    resolution_m = 250
    zone_tampon_m = 250
    mode = "reel"
    cache_ttl_s = TTL_STABLE        # la pédologie ne bouge pas

    def __init__(self, *, timeout_s: float | None = None,
                 session: requests.Session | None = None) -> None:
        self._timeout_s = timeout_s
        self._session = session

    def _collecter_valeurs(self, lat: float, lon: float) -> tuple[dict, float]:
        try:
            donnees = self._telecharger(lat, lon)
            ph, texture, fractions = _extraire(donnees)
        except Exception as exc:  # noqa: BLE001 — tracé puis relancé (base → "indisponible")
            logger.warning("agent sol réel indisponible en (%s, %s) : %s", lat, lon, exc)
            raise
        valeurs = {"ph_eau": round(ph, 1), "type_sol": texture, **fractions}
        return valeurs, _CONFIANCE_NOMINALE

    def _telecharger(self, lat: float, lon: float) -> dict:
        client = self._session or requests
        reponse = client.get(
            _URL,
            params=[
                ("lon", lon),
                ("lat", lat),
                ("property", "phh2o"),
                ("property", "clay"),
                ("property", "sand"),
                ("property", "silt"),
                ("depth", _PROFONDEUR),
                ("value", "mean"),
            ],
            timeout=timeout_http(self._timeout_s),
        )
        reponse.raise_for_status()
        return reponse.json()


def _extraire(donnees: dict) -> tuple[float, str, dict]:
    couches = {c.get("name"): c for c in (donnees.get("properties") or {}).get("layers", [])}

    def moyenne(nom: str) -> float:
        couche = couches.get(nom)
        if not couche:
            raise ValueError(f"propriété SoilGrids absente : {nom}")
        for profondeur in couche.get("depths", []):
            valeur = (profondeur.get("values") or {}).get("mean")
            if valeur is not None:
                return float(valeur)
        raise ValueError(f"propriété SoilGrids sans valeur : {nom}")

    ph = moyenne("phh2o") / 10.0            # SoilGrids : pH × 10
    argile = moyenne("clay") / 10.0         # g/kg → %
    sable = moyenne("sand") / 10.0
    limon = moyenne("silt") / 10.0
    if not 0.0 <= ph <= 14.0:
        raise ValueError(f"pH SoilGrids hors bornes : {ph}")

    fractions = {
        "argile_pct": round(argile, 1),
        "sable_pct": round(sable, 1),
        "limon_pct": round(limon, 1),
    }
    return ph, _classe_texture(argile, sable, limon), fractions


def _classe_texture(argile_pct: float, sable_pct: float, limon_pct: float) -> str:
    """Classe simplifiée alignée sur ``interpretation.TEXTURES``."""
    if argile_pct >= 35.0:
        return "argileux"
    if sable_pct >= 65.0:
        return "sableux"
    if limon_pct >= 50.0:
        return "limoneux"
    return "franc"
