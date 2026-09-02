"""
Agent topo RÉEL — DEM Copernicus GLO-30 via l'API OpenTopography.

Premier agent réel du pipeline. Interroge ``globaldem`` (OpenTopography)
pour une petite emprise (~150 m de rayon) autour du point, récupère la
grille d'altitudes au format AAIGrid (texte, sans GDAL) et en dérive
l'altitude au centre et la pente moyenne (%).

Résilience : ``_collecter_valeurs`` lève sur n'importe quel incident
(timeout, API en erreur, pas de donnée, clé absente). La classe de base
:class:`~agriscore.agents.base.Agent` rattrape et renvoie alors
``statut="indisponible"`` — le pipeline n'est jamais interrompu par cet
agent. Aucune donnée n'est écrite en base ici.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass

import requests

from agriscore.agents._cache import TTL_STABLE
from agriscore.agents._config import METRES_PAR_DEGRE as _METRES_PAR_DEGRE
from agriscore.agents._config import reglage, timeout_http
from agriscore.agents.base import Agent

logger = logging.getLogger(__name__)

_URL = "https://portal.opentopography.org/API/globaldem"
_DEMTYPE = "COP30"                 # Copernicus GLO-30
_CONFIANCE_NOMINALE = 0.9         # DEM public, grille complète


@dataclass(frozen=True)
class _GrilleMNT:
    ncols: int
    nrows: int
    cellsize_deg: float
    nodata: float
    lignes: list[list[float]]     # lignes[0] = rangée la plus au nord

    def altitude(self, ligne: int, col: int) -> float:
        valeur = self.lignes[ligne][col]
        if valeur == self.nodata or valeur != valeur:  # NODATA ou NaN
            raise ValueError("cellule MNT sans donnée (NODATA)")
        return valeur


class AgentTopoReel(Agent):
    dimension = "topo"
    source = "Copernicus GLO-30 / OpenTopography"
    resolution_m = 30
    zone_tampon_m = 150
    mode = "reel"
    cache_ttl_s = TTL_STABLE        # le relief ne bouge pas

    def __init__(self, *, api_key: str | None = None, timeout_s: float | None = None,
                 session: requests.Session | None = None) -> None:
        self._api_key = api_key
        self._timeout_s = timeout_s
        self._session = session

    # -- interface Agent -------------------------------------------------

    def _collecter_valeurs(self, lat: float, lon: float) -> tuple[dict, float]:
        try:
            grille = self._telecharger_grille(lat, lon)
            altitude, pente_pct = _altitude_et_pente(grille, lat)
        except Exception as exc:  # noqa: BLE001 — tracé puis relancé, la base convertit en "indisponible"
            logger.warning("agent topo réel indisponible en (%s, %s) : %s", lat, lon, exc)
            raise
        valeurs = {
            "altitude_m": round(altitude, 1),
            "pente_pct": round(pente_pct, 2),
            "dem": _DEMTYPE,
        }
        return valeurs, _confiance(grille)

    # -- détail ---------------------------------------------------------

    def _telecharger_grille(self, lat: float, lon: float) -> _GrilleMNT:
        cle = self._api_key if self._api_key is not None else reglage("OPENTOPOGRAPHY_API_KEY")
        if not cle:
            raise RuntimeError("OPENTOPOGRAPHY_API_KEY absente : agent topo réel non provisionné")

        sud, nord, ouest, est = _emprise(lat, lon, self.zone_tampon_m)
        client = self._session or requests
        reponse = client.get(
            _URL,
            params={
                "demtype": _DEMTYPE,
                "south": sud,
                "north": nord,
                "west": ouest,
                "east": est,
                "outputFormat": "AAIGrid",
                "API_Key": cle,
            },
            timeout=timeout_http(self._timeout_s),
        )
        reponse.raise_for_status()
        return _parser_aaigrid(reponse.text)


# ──────────────────────────────────────────────────────────────────────
# Géométrie + parsing (fonctions pures)
# ──────────────────────────────────────────────────────────────────────

def _emprise(lat: float, lon: float, tampon_m: float) -> tuple[float, float, float, float]:
    """(sud, nord, ouest, est) d'un carré de demi-côté ``tampon_m`` autour du point."""
    d_lat = tampon_m / _METRES_PAR_DEGRE
    d_lon = tampon_m / (_METRES_PAR_DEGRE * max(math.cos(math.radians(lat)), 1e-6))
    return lat - d_lat, lat + d_lat, lon - d_lon, lon + d_lon


def _parser_aaigrid(texte: str) -> _GrilleMNT:
    """Parse une grille ESRI ASCII (AAIGrid). Texte pur, aucune dépendance SIG."""
    jetons = texte.split()
    cles_entete = {
        "ncols", "nrows", "xllcorner", "yllcorner",
        "xllcenter", "yllcenter", "cellsize", "nodata_value",
    }
    entete: dict[str, str] = {}
    i = 0
    while i + 1 < len(jetons) and jetons[i].lower() in cles_entete:
        entete[jetons[i].lower()] = jetons[i + 1]
        i += 2

    try:
        ncols = int(entete["ncols"])
        nrows = int(entete["nrows"])
        cellsize = float(entete["cellsize"])
    except (KeyError, ValueError) as exc:
        raise ValueError(f"en-tête AAIGrid illisible : {exc}") from exc
    nodata = float(entete.get("nodata_value", "-9999"))

    valeurs = jetons[i:i + ncols * nrows]
    if len(valeurs) != ncols * nrows:
        raise ValueError("grille AAIGrid tronquée")
    plat = [float(v) for v in valeurs]
    lignes = [plat[r * ncols:(r + 1) * ncols] for r in range(nrows)]
    return _GrilleMNT(ncols=ncols, nrows=nrows, cellsize_deg=cellsize, nodata=nodata, lignes=lignes)


def _altitude_et_pente(grille: _GrilleMNT, lat_ref: float) -> tuple[float, float]:
    """Altitude de la cellule centrale + pente (%) par différences centrées."""
    if grille.nrows < 3 or grille.ncols < 3:
        raise ValueError("grille MNT trop petite pour estimer la pente (min 3×3)")

    r, c = grille.nrows // 2, grille.ncols // 2
    altitude = grille.altitude(r, c)

    pas_m_y = grille.cellsize_deg * _METRES_PAR_DEGRE
    pas_m_x = grille.cellsize_deg * _METRES_PAR_DEGRE * math.cos(math.radians(lat_ref))

    dz_dx = (grille.altitude(r, c + 1) - grille.altitude(r, c - 1)) / (2 * pas_m_x)
    dz_dy = (grille.altitude(r - 1, c) - grille.altitude(r + 1, c)) / (2 * pas_m_y)
    pente_pct = math.hypot(dz_dx, dz_dy) * 100.0
    return altitude, pente_pct


def _confiance(grille: _GrilleMNT) -> float:
    total = grille.ncols * grille.nrows
    valides = sum(
        1 for ligne in grille.lignes for v in ligne if v != grille.nodata and v == v
    )
    couverture = valides / total if total else 0.0
    return round(_CONFIANCE_NOMINALE * couverture, 2)
