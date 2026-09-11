"""
Point d'entrée applicatif du pipeline AgriScore.

Choisit le jeu d'agents selon le flag admin ``ConfigurationAgriScore.actif``
et les poids selon ``ConfigurationAgriScore.poids_nominaux()``, puis délègue
à l'orchestrateur. C'est le seul module du pipeline qui touche à l'ORM (via
la config) — le reste (agents, scoring, agrégation, interprétation,
orchestrateur) est du Python pur.
"""

from __future__ import annotations

from agriscore.agents import AGENTS_DEFAUT, AGENTS_SIMULES
from agriscore.models import ConfigurationAgriScore
from agriscore.orchestrateur import generer_passeport


def passeport_parcelle(lat: float, lon: float) -> dict:
    """Passeport JSON pour un couple ``(lat, lon)``.

    ``ConfigurationAgriScore.actif`` décoché ⇒ agents simulés : aucune API
    externe n'est appelée (interrupteur de secours façon modération). Les
    poids des 5 dimensions sont ceux de la configuration admin (2026-09-11,
    pondérations configurables sans redéploiement) — repli sur les poids
    nominaux d'origine si la config est illisible, cf.
    ConfigurationAgriScore.poids_nominaux().
    """
    actif = ConfigurationAgriScore.pipeline_actif()
    agents = AGENTS_DEFAUT if actif else AGENTS_SIMULES
    poids_nominaux = ConfigurationAgriScore.poids_nominaux()
    return generer_passeport(lat, lon, agents=agents, poids_nominaux=poids_nominaux)
