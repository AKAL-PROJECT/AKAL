"""
Orchestrateur du pipeline AgriScore — assemble le Passeport de parcelle.

Enchaîne, pour un couple ``(lat, lon)`` :

===============  ==================================================================
COLLECTE         les 5 agents → 5 ``AgentResult``            (agriscore.agents)
SCORING          chaque ``AgentResult`` « ok » → sous-score /100  (agriscore.scoring)
AGRÉGATION       sous-scores + confiances → score global + fiabilité (agriscore.aggregation)
INTERPRÉTATION   profil brut → cultures suggérées            (agriscore.interpretation)
===============  ==================================================================

Sortie : le JSON complet du Passeport. Les agents par défaut
(``AGENTS_DEFAUT``) mélangent aujourd'hui l'agent topo réel (Copernicus
GLO-30) et 4 agents simulés ; passer ``agents=AGENTS_SIMULES`` force un run
100 % hors-ligne. On branche les agents réels un par un via ce paramètre.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import replace

from agriscore.aggregation import agreger_scores
from agriscore.agent_result import AgentResult
from agriscore.agents import AGENTS_DEFAUT, Agent, horodatage_iso, valider_coordonnees
from agriscore.interpretation import TEXTURES, ProfilParcelle, suggerer_cultures
from agriscore.scoring import score_acces, score_climat, score_ndvi, score_sol, score_topo

# Dimension → (fonction de score étape 1, clé attendue dans AgentResult.valeurs).
_SCORING = {
    "sol": (score_sol, "ph_eau"),
    "climat": (score_climat, "pluviometrie_mm"),
    "ndvi": (score_ndvi, "ndvi_moyen"),
    "topo": (score_topo, "pente_pct"),
    "acces": (score_acces, "distance_route_m"),
}

_AVERTISSEMENT_SIMULE = (
    "Passeport généré en mode simulé : valeurs plausibles issues du prototype, "
    "aucune donnée terrain réelle. À ne pas présenter comme une mesure."
)


def generer_passeport(
    lat: float,
    lon: float,
    agents: Sequence[Agent] | None = None,
) -> dict:
    """``(lat, lon)`` → Passeport JSON complet.

    Args:
        lat, lon: coordonnées décimales WGS84.
        agents: agents à interroger. Par défaut ``AGENTS_DEFAUT`` (topo réel +
            4 simulés) ; ``AGENTS_SIMULES`` pour un run 100 % hors-ligne.

    Returns:
        Le dict du Passeport, JSON-sérialisable : coordonnées, mode, score
        global, fiabilité, détail par dimension, cultures suggérées,
        avertissement.
    """
    valider_coordonnees(lat, lon)
    agents = tuple(AGENTS_DEFAUT if agents is None else agents)

    resultats = _collecter(agents, lat, lon)
    resultats, sous_scores = _scorer(resultats)
    agregation = agreger_scores(resultats, sous_scores)
    cultures = suggerer_cultures(_profil(resultats))

    return _assembler(lat, lon, agents, resultats, sous_scores, agregation, cultures)


def _collecter(agents: Sequence[Agent], lat: float, lon: float) -> list[AgentResult]:
    resultats = [agent.collecter(lat, lon) for agent in agents]
    dimensions = [resultat.dimension for resultat in resultats]
    if len(set(dimensions)) != len(dimensions):
        raise ValueError(f"deux agents pour la même dimension : {dimensions}")
    return resultats


def _scorer(resultats: list[AgentResult]) -> tuple[list[AgentResult], dict[str, float]]:
    """Sous-scores des dimensions « ok ». Un résultat « ok » non scorable est
    rétrogradé en « indisponible » (fail-open, comme un agent en panne)."""
    sortie: list[AgentResult] = []
    sous_scores: dict[str, float] = {}
    for resultat in resultats:
        if resultat.statut != "ok" or resultat.dimension not in _SCORING:
            sortie.append(resultat)
            continue
        fonction, cle = _SCORING[resultat.dimension]
        try:
            sous_scores[resultat.dimension] = fonction(resultat.valeurs[cle])
            sortie.append(resultat)
        except (KeyError, TypeError, ValueError):
            sortie.append(replace(resultat, statut="indisponible", confiance=0.0))
    return sortie, sous_scores


def _profil(resultats: list[AgentResult]) -> ProfilParcelle:
    par_dimension = {r.dimension: r for r in resultats if r.statut == "ok"}

    def valeur(dimension: str, cle: str):
        resultat = par_dimension.get(dimension)
        return resultat.valeurs.get(cle) if resultat else None

    texture = valeur("sol", "type_sol")
    return ProfilParcelle(
        ph=valeur("sol", "ph_eau"),
        pluvio_mm=valeur("climat", "pluviometrie_mm"),
        pente_pct=valeur("topo", "pente_pct"),
        texture_sol=texture if texture in TEXTURES else None,
    )


def _assembler(lat, lon, agents, resultats, sous_scores, agregation, cultures) -> dict:
    detail = agregation["detail_par_dimension"]
    dimensions = {}
    for resultat in resultats:
        info = detail[resultat.dimension]
        dimensions[resultat.dimension] = {
            "statut": resultat.statut,
            "mode": resultat.mode,
            "sous_score": sous_scores.get(resultat.dimension),
            "confiance": info["confiance"],
            "valeurs": resultat.valeurs,
            "source": resultat.source,
            "date_collecte": resultat.date_collecte,
            "resolution_m": resultat.resolution_m,
            "zone_tampon_m": resultat.zone_tampon_m,
            "poids_nominal": info["poids_nominal"],
            "poids_effectif_renormalise": info["poids_effectif_renormalise"],
            "contribution": info["contribution"],
        }

    modes = {agent.mode for agent in agents}
    mode_global = modes.pop() if len(modes) == 1 else "mixte"

    return {
        "coordonnees": {"lat": lat, "lon": lon},
        "genere_le": horodatage_iso(),
        "mode": mode_global,
        "score_global": agregation["score_global"],
        "fiabilite_globale": agregation["fiabilite_globale"],
        "dimensions": dimensions,
        "cultures_suggerees": [reco.to_dict() for reco in cultures],
        "avertissement": "" if mode_global == "reel" else _AVERTISSEMENT_SIMULE,
    }
