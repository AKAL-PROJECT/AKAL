"""Couche COLLECTE du pipeline AgriScore : interface commune et agents."""

from agriscore.agents.acces_reel import AgentAccesReel
from agriscore.agents.base import Agent, AgentSimule, horodatage_iso, valider_coordonnees
from agriscore.agents.climat_reel import AgentClimatReel
from agriscore.agents.ndvi_reel import AgentNdviReel
from agriscore.agents.simules import (
    AGENTS_SIMULES,
    AgentAccesSimule,
    AgentClimatSimule,
    AgentNdviSimule,
    AgentSolSimule,
    AgentTopoSimule,
)
from agriscore.agents.sol_reel import AgentSolReel
from agriscore.agents.topo_reel import AgentTopoReel

#: Composition courante du pipeline. Les 5 agents sont désormais réels ; on
#: peut toujours forcer un run 100 % hors-ligne avec ``AGENTS_SIMULES``.
#: Sans provisionnement (clés d'API), les agents concernés se mettent
#: proprement en ``statut="indisponible"`` — le pipeline reste debout.
AGENTS_DEFAUT: tuple[Agent, ...] = (
    AgentSolReel(),
    AgentClimatReel(),
    AgentNdviReel(),
    AgentTopoReel(),
    AgentAccesReel(),
)

__all__ = [
    "Agent",
    "AgentSimule",
    "valider_coordonnees",
    "horodatage_iso",
    "AGENTS_SIMULES",
    "AGENTS_DEFAUT",
    "AgentSolSimule",
    "AgentClimatSimule",
    "AgentNdviSimule",
    "AgentTopoSimule",
    "AgentAccesSimule",
    "AgentSolReel",
    "AgentClimatReel",
    "AgentNdviReel",
    "AgentTopoReel",
    "AgentAccesReel",
]
