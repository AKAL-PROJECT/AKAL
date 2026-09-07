"""
Agent NDVI RÉEL — série mensuelle Sentinel-2 via l'API Statistical (CDSE).

Interroge la Copernicus Data Space Ecosystem (gratuite, OAuth2
client-credentials). Un évalscript calcule le NDVI en **masquant les nuages**
(Scene Classification Layer : ombres, nuages, cirrus, neige), et l'API
agrège par **mois sur 12 mois glissants**.

- ``ndvi_moyen`` = moyenne des mois « exploitables » (assez de pixels clairs).
- ``confiance`` = 0.9 × (mois exploitables / 12) : peu d'images nettes ⇒
  confiance basse. Aucun mois exploitable ⇒ échec ⇒ ``statut="indisponible"``.

Résilience : OAuth KO, API KO, timeout, série vide → tracé puis relancé ;
la classe de base convertit en ``statut="indisponible"``.
"""

from __future__ import annotations

import datetime as _dt
import logging

import requests

from agriscore.agents._cache import TTL_COURT
from agriscore.agents._config import emprise_bbox, reglage, timeout_http
from agriscore.agents.base import Agent

logger = logging.getLogger(__name__)

_URL_STATS = "https://sh.dataspace.copernicus.eu/api/v1/statistics"
_URL_TOKEN = (
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
)
_N_MOIS = 12
_CONFIANCE_MAX = 0.9
_COUVERTURE_MIN = 0.3            # fraction minimale de pixels clairs pour qu'un mois compte

_EVALSCRIPT = """//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  var nuage = [3, 8, 9, 10, 11].indexOf(s.SCL) >= 0;   // ombres, nuages, cirrus, neige
  var clair = s.dataMask === 1 && !nuage ? 1 : 0;
  var denom = s.B08 + s.B04;
  var ndvi = denom === 0 ? 0 : (s.B08 - s.B04) / denom;
  return { ndvi: [ndvi], dataMask: [clair] };
}
"""


class AgentNdviReel(Agent):
    dimension = "ndvi"
    source = "Sentinel-2 L2A / Copernicus Data Space (Statistical API)"
    resolution_m = 10
    zone_tampon_m = 50
    mode = "reel"
    cache_ttl_s = TTL_COURT        # fenêtre glissante de 12 mois → TTL court

    def __init__(self, *, client_id: str | None = None, client_secret: str | None = None,
                 token: str | None = None, timeout_s: float | None = None,
                 session: requests.Session | None = None,
                 aujourd_hui: _dt.date | None = None) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._token = token
        self._timeout_s = timeout_s
        self._session = session
        self._aujourd_hui = aujourd_hui   # injectable → fenêtre déterministe en test

    def _collecter_valeurs(self, lat: float, lon: float) -> tuple[dict, float]:
        try:
            jeton = self._token or self._obtenir_token()
            debut, fin = _fenetre_12_mois(self._aujourd_hui or _dt.date.today())
            serie = self._statistiques(lat, lon, jeton, debut, fin)
            ndvi_moyen, mois_exploitables = _agreger_serie(serie, _COUVERTURE_MIN)
        except Exception as exc:  # noqa: BLE001 — tracé puis relancé (base → "indisponible")
            logger.warning("agent ndvi réel indisponible en (%s, %s) : %s", lat, lon, exc)
            raise
        confiance = round(_CONFIANCE_MAX * min(mois_exploitables, _N_MOIS) / _N_MOIS, 2)
        valeurs = {
            "ndvi_moyen": round(ndvi_moyen, 3),
            "mois_exploitables": mois_exploitables,
            "mois_total": _N_MOIS,
            "fenetre": f"{debut.isoformat()}..{fin.isoformat()}",
            "capteur": "sentinel-2-l2a",
        }
        return valeurs, confiance

    # -- HTTP ---------------------------------------------------------------

    def _obtenir_token(self) -> str:
        client_id = self._client_id or reglage("CDSE_CLIENT_ID")
        secret = self._client_secret or reglage("CDSE_CLIENT_SECRET")
        if not client_id or not secret:
            raise RuntimeError(
                "CDSE_CLIENT_ID / CDSE_CLIENT_SECRET absents : agent NDVI non provisionné"
            )
        client = self._session or requests
        reponse = client.post(
            _URL_TOKEN,
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": secret,
            },
            timeout=timeout_http(self._timeout_s),
        )
        reponse.raise_for_status()
        jeton = reponse.json().get("access_token")
        if not jeton:
            raise ValueError("réponse OAuth CDSE sans access_token")
        return jeton

    def _statistiques(self, lat: float, lon: float, jeton: str,
                      debut: _dt.date, fin: _dt.date) -> list:
        client = self._session or requests
        corps = {
            "input": {
                "bounds": {"bbox": list(emprise_bbox(lat, lon, self.zone_tampon_m))},
                "data": [{
                    "type": "sentinel-2-l2a",
                    "dataFilter": {"mosaickingOrder": "leastCC"},
                }],
            },
            "aggregation": {
                "timeRange": {
                    "from": f"{debut.isoformat()}T00:00:00Z",
                    "to": f"{fin.isoformat()}T23:59:59Z",
                },
                "aggregationInterval": {"of": "P1M"},
                "evalscript": _EVALSCRIPT,
                "resx": 10,
                "resy": 10,
            },
        }
        reponse = client.post(
            _URL_STATS,
            json=corps,
            headers={"Authorization": f"Bearer {jeton}"},
            timeout=timeout_http(self._timeout_s),
        )
        reponse.raise_for_status()
        return reponse.json().get("data", [])


# ──────────────────────────────────────────────────────────────────────
# Fonctions pures (série 12 mois, masquage nuages, comptage mois exploitables)
# ──────────────────────────────────────────────────────────────────────

def _fenetre_12_mois(aujourd_hui: _dt.date) -> tuple[_dt.date, _dt.date]:
    """12 mois calendaires pleins se terminant au dernier jour du mois écoulé."""
    fin = aujourd_hui.replace(day=1) - _dt.timedelta(days=1)
    annee, mois = fin.year, fin.month - (_N_MOIS - 1)
    while mois <= 0:
        mois += 12
        annee -= 1
    return _dt.date(annee, mois, 1), fin


def _stats_intervalle(intervalle: dict) -> dict | None:
    bandes = (((intervalle.get("outputs") or {}).get("ndvi") or {}).get("bands") or {})
    return (bandes.get("B0") or {}).get("stats")


def _agreger_serie(serie: list, couverture_min: float) -> tuple[float, int]:
    """(NDVI moyen des mois exploitables, nombre de mois exploitables).

    Un mois est exploitable si l'évalscript a produit des pixels clairs
    (``sampleCount``) et si leur part dans le total dépasse ``couverture_min``.
    """
    ndvis: list[float] = []
    for intervalle in serie:
        stats = _stats_intervalle(intervalle)
        if not stats:
            continue
        clairs = stats.get("sampleCount", 0) or 0
        masques = stats.get("noDataCount", 0) or 0
        total = clairs + masques
        if total == 0 or clairs / total < couverture_min:
            continue
        moyenne = stats.get("mean")
        if moyenne is None:
            continue
        ndvis.append(max(-1.0, min(1.0, float(moyenne))))

    if not ndvis:
        raise ValueError("aucun mois Sentinel-2 exploitable sur la fenêtre de 12 mois")
    return sum(ndvis) / len(ndvis), len(ndvis)
