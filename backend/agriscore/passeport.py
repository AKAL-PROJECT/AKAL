"""
Point d'entrée applicatif du pipeline AgriScore.

Choisit le jeu d'agents selon le flag admin ``ConfigurationAgriScore.actif``
puis délègue à l'orchestrateur. C'est le seul module du pipeline qui touche
à l'ORM (via le flag) — le reste (agents, scoring, agrégation,
interprétation, orchestrateur) est du Python pur.
"""

from __future__ import annotations

from agriscore.agents import AGENTS_DEFAUT, AGENTS_SIMULES
from agriscore.models import ConfigurationAgriScore
from agriscore.orchestrateur import generer_passeport


def passeport_parcelle(lat: float, lon: float) -> dict:
    """Passeport JSON pour un couple ``(lat, lon)``.

    ``ConfigurationAgriScore.actif`` décoché ⇒ agents simulés : aucune API
    externe n'est appelée (interrupteur de secours façon modération).
    """
    actif = ConfigurationAgriScore.pipeline_actif()
    agents = AGENTS_DEFAUT if actif else AGENTS_SIMULES
    return generer_passeport(lat, lon, agents=agents)
