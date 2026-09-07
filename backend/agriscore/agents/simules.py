"""
Agents simulés — couche COLLECTE en mode dégradé, sans aucune API.

Ils renvoient les valeurs du prototype AKAL (pH 7.4, pluviométrie 510 mm,
NDVI 0.71, pente 2 %, route à 1.1 km), invariantes vis-à-vis des
coordonnées. Objectif : faire tourner le pipeline de bout en bout et servir
de gabarit — chaque agent réel remplacera son homologue simulé en
implémentant ``_collecter_valeurs`` avec une vraie source de données.

Les ``resolution_m`` / ``zone_tampon_m`` reprennent l'ordre de grandeur de
la source réelle envisagée, pour que le Passeport simulé ait la même forme
que le futur Passeport réel.
"""

from __future__ import annotations

from agriscore.agents.base import AgentSimule

_SOURCE = "simulation-prototype"


class AgentSolSimule(AgentSimule):
    dimension = "sol"
    source = _SOURCE
    resolution_m = 250          # ordre de grandeur SoilGrids
    zone_tampon_m = 100

    def _collecter_valeurs(self, lat, lon):
        return {"ph_eau": 7.4, "type_sol": "argileux"}, 0.80


class AgentClimatSimule(AgentSimule):
    dimension = "climat"
    source = _SOURCE
    resolution_m = 5000         # ordre de grandeur CHIRPS
    zone_tampon_m = 2500

    def _collecter_valeurs(self, lat, lon):
        return {"pluviometrie_mm": 510, "periode": "moyenne annuelle 1991-2020"}, 0.80


class AgentNdviSimule(AgentSimule):
    dimension = "ndvi"
    source = _SOURCE
    resolution_m = 10           # ordre de grandeur Sentinel-2
    zone_tampon_m = 50

    def _collecter_valeurs(self, lat, lon):
        return {"ndvi_moyen": 0.71, "n_observations": 12}, 0.85


class AgentTopoSimule(AgentSimule):
    dimension = "topo"
    source = _SOURCE
    resolution_m = 30           # ordre de grandeur Copernicus DEM
    zone_tampon_m = 100

    def _collecter_valeurs(self, lat, lon):
        return {"pente_pct": 2.0, "altitude_m": 465}, 0.90


class AgentAccesSimule(AgentSimule):
    dimension = "acces"
    source = _SOURCE
    resolution_m = None         # réseau routier vectoriel (OSM), pas de maille
    zone_tampon_m = 500

    def _collecter_valeurs(self, lat, lon):
        return {"distance_route_m": 1100, "type_route": "route secondaire"}, 0.75


#: Les 5 agents simulés, un par dimension — jeu par défaut de l'orchestrateur.
AGENTS_SIMULES: tuple[AgentSimule, ...] = (
    AgentSolSimule(),
    AgentClimatSimule(),
    AgentNdviSimule(),
    AgentTopoSimule(),
    AgentAccesSimule(),
)
