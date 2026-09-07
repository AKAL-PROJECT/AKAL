"""
Couche AGRÉGATION du pipeline AgriScore — fonction pure.

``agreger_scores`` combine les cinq sous-scores dimensionnels (produits par
:mod:`agriscore.scoring`) et la confiance portée par chaque
:class:`AgentResult` en un score global sur 100 et une fiabilité globale en
pourcentage.

Algorithme
----------
1. Poids nominaux (somme = 100) : NDVI 25, Climat 20, Sol 20, Topo 20, Accès 15.
2. Poids effectif dᵢ = poids nominalᵢ × confianceᵢ. Une dimension
   ``statut="indisponible"`` est forcée à confiance 0 (donc poids effectif 0),
   quelle que soit la confiance inscrite dans l'``AgentResult``.
3. Renormalisation : poids relatifᵢ = poids effectifᵢ / Σ(poids effectif) × 100.
   La somme des poids relatifs vaut 100, répartie sur les seules dimensions
   présentes — une dimension indisponible sort du calcul, le reste absorbe
   sa part.
4. Score global = Σ(sous-scoreᵢ × poids relatifᵢ) / 100.
5. Fiabilité globale = Σ(confianceᵢ × poids nominalᵢ). Les poids nominaux
   sommant à 100, le résultat est directement un pourcentage 0–100.

Si toutes les dimensions sont indisponibles (Σ poids effectif = 0), le score
global vaut ``None`` (aucune donnée exploitable) et la fiabilité 0.0 —
cohérent avec ``score_courant`` nullable côté API (contrat de données §3.5).

Aucune I/O, aucun réseau, aucune dépendance Django.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping

from agriscore.agent_result import AgentResult

#: Poids nominaux par dimension. Somme = 100 — invariant du modèle.
POIDS_NOMINAUX: dict[str, int] = {
    "ndvi": 25,
    "climat": 20,
    "sol": 20,
    "topo": 20,
    "acces": 15,
}

DIMENSIONS: frozenset[str] = frozenset(POIDS_NOMINAUX)


def agreger_scores(
    resultats: Iterable[AgentResult],
    sous_scores: Mapping[str, float],
) -> dict:
    """Agrège cinq dimensions en un score global, une fiabilité et un détail.

    Args:
        resultats: les cinq ``AgentResult`` du pipeline, un par dimension
            (``ndvi``, ``climat``, ``sol``, ``topo``, ``acces``), sans doublon.
        sous_scores: sous-score /100 par dimension. Obligatoire pour chaque
            dimension ``statut="ok"`` ; facultatif (et ignoré) pour une
            dimension indisponible.

    Returns:
        ``{"score_global": float | None, "fiabilite_globale": float,
        "detail_par_dimension": {dim: {...}}}``. ``score_global`` et
        ``fiabilite_globale`` sont arrondis au centième ; les poids et
        contributions du détail au dix-millième.

    Raises:
        TypeError: ``resultats`` n'est pas un itérable d'``AgentResult``, ou
            ``sous_scores`` n'est pas un mapping de nombres.
        ValueError: dimension manquante, en double ou inconnue ; sous-score
            manquant pour une dimension ``ok`` ; sous-score hors de [0, 100].
    """
    par_dimension = _indexer(resultats)
    _valider_sous_scores(par_dimension, sous_scores)

    # Étapes 1–2 : confiance effective (0 si indisponible) et poids effectif.
    confiance_effective: dict[str, float] = {}
    poids_effectif: dict[str, float] = {}
    for dim, poids_nominal in POIDS_NOMINAUX.items():
        resultat = par_dimension[dim]
        confiance = resultat.confiance if resultat.statut == "ok" else 0.0
        confiance_effective[dim] = confiance
        poids_effectif[dim] = poids_nominal * confiance

    somme_effectifs = sum(poids_effectif.values())

    # Étapes 3–4 : renormalisation, contribution de chaque dimension.
    detail: dict[str, dict] = {}
    contributions: dict[str, float] = {}
    for dim, poids_nominal in POIDS_NOMINAUX.items():
        resultat = par_dimension[dim]
        if somme_effectifs > 0:
            poids_relatif = poids_effectif[dim] / somme_effectifs * 100
        else:
            poids_relatif = 0.0

        sous_score = sous_scores.get(dim)
        contribution = 0.0 if sous_score is None else sous_score * poids_relatif / 100
        contributions[dim] = contribution

        detail[dim] = {
            "statut": resultat.statut,
            "sous_score": None if sous_score is None else round(float(sous_score), 2),
            "confiance": confiance_effective[dim],
            "poids_nominal": poids_nominal,
            "poids_effectif": round(poids_effectif[dim], 4),
            "poids_effectif_renormalise": round(poids_relatif, 4),
            "contribution": round(contribution, 4),
        }

    score_global = round(sum(contributions.values()), 2) if somme_effectifs > 0 else None

    # Étape 5 : fiabilité sur les poids nominaux, confiance effective.
    fiabilite = sum(
        confiance_effective[dim] * POIDS_NOMINAUX[dim] for dim in POIDS_NOMINAUX
    )

    return {
        "score_global": score_global,
        "fiabilite_globale": round(fiabilite, 2),
        "detail_par_dimension": detail,
    }


# ──────────────────────────────────────────────────────────────────────
# Validation des entrées
# ──────────────────────────────────────────────────────────────────────

def _indexer(resultats: Iterable[AgentResult]) -> dict[str, AgentResult]:
    """Indexe les ``AgentResult`` par dimension ; exige les cinq, sans doublon."""
    if isinstance(resultats, (str, bytes, Mapping)) or not isinstance(resultats, Iterable):
        raise TypeError("resultats doit être un itérable d'AgentResult")

    par_dimension: dict[str, AgentResult] = {}
    for resultat in resultats:
        if not isinstance(resultat, AgentResult):
            raise TypeError(
                "resultats ne doit contenir que des AgentResult, reçu "
                f"{type(resultat).__name__}"
            )
        if resultat.dimension in par_dimension:
            raise ValueError(f"dimension en double : {resultat.dimension!r}")
        par_dimension[resultat.dimension] = resultat

    manquantes = DIMENSIONS - par_dimension.keys()
    if manquantes:
        raise ValueError(
            f"dimensions manquantes : {', '.join(sorted(manquantes))} — "
            "les cinq dimensions sont requises (une dimension en échec doit "
            "être fournie avec statut='indisponible')"
        )
    inconnues = par_dimension.keys() - DIMENSIONS
    if inconnues:  # impossible via un AgentResult valide, garde-fou défensif
        raise ValueError(f"dimensions inconnues : {', '.join(sorted(inconnues))}")
    return par_dimension


def _valider_sous_scores(
    par_dimension: Mapping[str, AgentResult],
    sous_scores: Mapping[str, float],
) -> None:
    if not isinstance(sous_scores, Mapping):
        raise TypeError("sous_scores doit être un mapping {dimension: sous_score}")

    inconnues = sous_scores.keys() - DIMENSIONS
    if inconnues:
        raise ValueError(
            f"sous_scores : dimensions inconnues {', '.join(sorted(inconnues))}"
        )

    for dim, resultat in par_dimension.items():
        if resultat.statut == "ok" and dim not in sous_scores:
            raise ValueError(f"sous_score manquant pour la dimension {dim!r} (statut='ok')")

    for dim, valeur in sous_scores.items():
        if isinstance(valeur, bool) or not isinstance(valeur, (int, float)):
            raise TypeError(
                f"sous_scores[{dim!r}] doit être un nombre, reçu {type(valeur).__name__}"
            )
        if not 0.0 <= float(valeur) <= 100.0:
            raise ValueError(f"sous_scores[{dim!r}] = {valeur} hors de [0, 100]")
