"""
Utilitaires partagés par les agents réels du pipeline AgriScore.

- ``reglage`` / ``timeout_http`` : lire la configuration (clés d'API, timeout)
  **au moment de l'appel**, depuis les settings Django si disponibles, sinon
  l'environnement — jamais à l'import, pour ne pas coupler les agents à Django.
- ``emprise_bbox`` : petite boîte englobante WGS84 autour d'un point.
"""

from __future__ import annotations

import math
import os

METRES_PAR_DEGRE = 111_320.0  # 1° de latitude ≈ 111.32 km


def reglage(nom: str, defaut: str = "") -> str:
    """``settings.<nom>`` s'il est défini et non vide, sinon ``os.environ``, sinon ``defaut``."""
    try:
        from django.conf import settings

        valeur = getattr(settings, nom, None)
        if valeur not in (None, ""):
            return str(valeur)
    except Exception:  # noqa: BLE001 — hors contexte Django : on retombe sur l'environnement
        pass
    return os.environ.get(nom, defaut)


def timeout_http(explicite: float | None) -> float:
    """Timeout des requêtes : valeur explicite, sinon ``AGRISCORE_HTTP_TIMEOUT_S``, sinon 10 s."""
    if explicite is not None:
        return float(explicite)
    try:
        return float(reglage("AGRISCORE_HTTP_TIMEOUT_S", "10"))
    except (TypeError, ValueError):
        return 10.0


def emprise_bbox(lat: float, lon: float, rayon_m: float) -> tuple[float, float, float, float]:
    """(ouest, sud, est, nord) d'un carré de demi-côté ``rayon_m`` autour du point."""
    d_lat = rayon_m / METRES_PAR_DEGRE
    d_lon = rayon_m / (METRES_PAR_DEGRE * max(math.cos(math.radians(lat)), 1e-6))
    return lon - d_lon, lat - d_lat, lon + d_lon, lat + d_lat
