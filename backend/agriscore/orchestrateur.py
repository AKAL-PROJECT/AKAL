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
(``AGENTS_DEFAUT``) sont les 5 agents réels ; passer ``agents=AGENTS_SIMULES``
force un run 100 % hors-ligne.

``mode`` reflète la nature des sources qui ont abouti (« reel » / « simule » /
« mixte »), et ``dimensions_indisponibles`` liste les dimensions qui ont
échoué — un passeport à qui il manque une dimension le signale dans
``avertissement``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace

from agriscore.aggregation import POIDS_NOMINAUX, agreger_scores
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

#: Libellés courts pour l'avertissement « passeport partiel ».
_LIBELLE_DIMENSION = {
    "sol": "sol",
    "climat": "climat",
    "ndvi": "couvert végétal",
    "topo": "relief",
    "acces": "accès routier",
}

_AVERTISSEMENT_PARTIEL = (
    "Passeport partiel : {dims} indisponible(s). Score et fiabilité calculés "
    "sur les dimensions restantes."
)
_AVERTISSEMENT_VIDE = (
    "Aucune dimension exploitable pour cette parcelle : score indisponible."
)


def generer_passeport(
    lat: float,
    lon: float,
    agents: Sequence[Agent] | None = None,
    poids_nominaux: Mapping[str, int] = POIDS_NOMINAUX,
) -> dict:
    """``(lat, lon)`` → Passeport JSON complet.

    Args:
        lat, lon: coordonnées décimales WGS84.
        agents: agents à interroger. Par défaut ``AGENTS_DEFAUT`` (5 agents
            réels) ; ``AGENTS_SIMULES`` pour un run 100 % hors-ligne.
        poids_nominaux: transmis tel quel à ``agreger_scores`` (cf. sa
            docstring). Par défaut ``POIDS_NOMINAUX`` ; l'appelant applicatif
            (agriscore.passeport) passe la config admin-éditable. Ce module
            reste pur — il ne lit ``ConfigurationAgriScore`` nulle part.

    Returns:
        Le dict du Passeport, JSON-sérialisable : mode, score global,
        fiabilité, détail par dimension, dimensions indisponibles, cultures
        suggérées, avertissement. **Pas les coordonnées** : le passeport est
        public, les renvoyer contournerait le floutage de localisation d'une
        annonce confidentielle (cf. annonces._appliquer_flou_localisation).
    """
    valider_coordonnees(lat, lon)
    agents = tuple(AGENTS_DEFAUT if agents is None else agents)

    resultats = _collecter(agents, lat, lon)
    resultats, sous_scores = _scorer(resultats)
    agregation = agreger_scores(resultats, sous_scores, poids_nominaux)
    cultures = suggerer_cultures(_profil(resultats))

    return _assembler(agents, resultats, sous_scores, agregation, cultures)


def _collecter(agents: Sequence[Agent], lat: float, lon: float) -> list[AgentResult]:
    # Agents indépendants, chacun borné par AGRISCORE_HTTP_TIMEOUT_S : on les
    # interroge en parallèle plutôt qu'en séquence (cache froid ~20 s → ~5 s).
    # `executor.map` conserve l'ordre d'entrée → le dict `dimensions` du
    # passeport reste déterministe. `Agent.collecter` ne lève jamais (coords
    # validées en amont) et ne touche pas l'ORM (le flag est lu dans
    # passeport.py) — pas de connexion DB à gérer par thread.
    with ThreadPoolExecutor(max_workers=max(len(agents), 1)) as executor:
        resultats = list(executor.map(lambda agent: agent.collecter(lat, lon), agents))
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


def _assembler(agents, resultats, sous_scores, agregation, cultures) -> dict:
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

    # Mode = nature des sources qui ont RÉELLEMENT contribué (résultats « ok »),
    # pas des agents déclarés : un agent réel tombé en panne ne rend pas le
    # passeport « réel » pour autant. Repli sur les agents déclarés seulement
    # si aucune dimension n'a abouti (mode alors indicatif, score_global=None).
    modes_ok = {r.mode for r in resultats if r.statut == "ok"}
    modes_contributifs = modes_ok or {agent.mode for agent in agents}
    mode_global = (
        next(iter(modes_contributifs)) if len(modes_contributifs) == 1 else "mixte"
    )

    indisponibles = [dim for dim in _SCORING if dimensions[dim]["statut"] != "ok"]

    avertissements = []
    if mode_global != "reel" and modes_ok:
        avertissements.append(_AVERTISSEMENT_SIMULE)
    if indisponibles:
        if agregation["score_global"] is None:
            avertissements.append(_AVERTISSEMENT_VIDE)
        else:
            avertissements.append(_AVERTISSEMENT_PARTIEL.format(
                dims=", ".join(_LIBELLE_DIMENSION[dim] for dim in indisponibles),
            ))

    return {
        "genere_le": horodatage_iso(),
        "mode": mode_global,
        "score_global": agregation["score_global"],
        "fiabilite_globale": agregation["fiabilite_globale"],
        "dimensions": dimensions,
        "dimensions_indisponibles": indisponibles,
        "cultures_suggerees": [reco.to_dict() for reco in cultures],
        "avertissement": " ".join(avertissements),
    }
