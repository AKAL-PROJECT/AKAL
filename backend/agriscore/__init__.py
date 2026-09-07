"""
Pipeline AgriScore — évaluation agronomique d'une parcelle.

Ce paquet héberge le pipeline d'enrichissement : des agents de collecte,
un par dimension (sol, climat, NDVI, topographie, accès), puis l'agrégation
en un score. Il est volontairement découplé des modèles Django de l'app
``annonces`` — le pipeline ne manipule que des objets valeur immuables et
n'écrit en base que via l'endpoint interne (cf. docs/AKAL_Contrat_Donnees_v1.2.md §5).

Première brique posée : :class:`AgentResult`, le contrat de sortie unique
des agents. Rien d'autre n'est encore implémenté ici (ni agent, ni score).
"""

from .agent_result import AgentResult

__all__ = ["AgentResult"]
