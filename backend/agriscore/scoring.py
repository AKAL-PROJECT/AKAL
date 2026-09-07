"""
Couche SCORING du pipeline AgriScore — fonctions pures.

Une fonction par dimension. Chacune transforme **une** donnée brute
(mesurée ou simulée en amont) en un sous-score sur 100. Aucune I/O, aucun
appel réseau, aucune dépendance Django : ce sont des fonctions
mathématiques, testables et rejouables à l'identique.

Modèle commun
-------------
Les seuils de l'énoncé sont posés comme des *ancres* ``(x, y)`` où ``y`` est
le sous-score atteint à l'abscisse ``x``. Entre deux ancres : interpolation
linéaire — jamais de marche d'escalier. En deçà de la première ancre / au-delà
de la dernière : plateau constant. Le résultat est donc toujours continu,
borné à ``[0, 100]``, et monotone là où la dimension l'impose (climat et NDVI
croissants, topo et accès décroissants ; le sol a un optimum central).

Domaine de validité
-------------------
Chaque fonction lève ``TypeError`` sur une entrée non numérique (``None``,
``str``, ``bool``) et ``ValueError`` sur une entrée physiquement impossible
(pH hors ``[0, 14]``, NDVI hors ``[-1, 1]``, pluviométrie / pente / distance
négative, ``nan`` / ``inf``). Les valeurs extrêmes mais réelles (2000 mm de
pluie, pente de 200 %) sont acceptées et retombent sur le plateau.
"""

from __future__ import annotations

import math

__all__ = [
    "score_sol",
    "score_climat",
    "score_ndvi",
    "score_topo",
    "score_acces",
]

Ancres = tuple[tuple[float, float], ...]


# ──────────────────────────────────────────────────────────────────────
# Outils internes
# ──────────────────────────────────────────────────────────────────────

def _valider_nombre(valeur: object, nom: str) -> float:
    """Convertit en ``float`` fini ou lève ``TypeError`` / ``ValueError``.

    ``bool`` est rejeté explicitement : ``True`` est un ``int`` en Python,
    ce n'est jamais un pH ni une pluviométrie.
    """
    if isinstance(valeur, bool) or not isinstance(valeur, (int, float)):
        raise TypeError(
            f"{nom} doit être un nombre (int/float), reçu {type(valeur).__name__}"
        )
    nombre = float(valeur)
    if math.isnan(nombre) or math.isinf(nombre):
        raise ValueError(f"{nom} doit être un nombre fini, reçu {valeur!r}")
    return nombre


def _exiger_intervalle(valeur: float, nom: str, mini: float, maxi: float) -> None:
    if not mini <= valeur <= maxi:
        raise ValueError(
            f"{nom} = {valeur} hors du domaine physique [{mini}, {maxi}]"
        )


def _exiger_non_negatif(valeur: float, nom: str) -> None:
    if valeur < 0:
        raise ValueError(f"{nom} = {valeur} ne peut pas être négatif")


def _interpoler(x: float, ancres: Ancres) -> float:
    """Ordonnée en ``x`` par interpolation linéaire entre ancres triées.

    Plateau constant sous la première ancre et au-dessus de la dernière.
    """
    x_premier, y_premier = ancres[0]
    if x <= x_premier:
        return y_premier
    for (xa, ya), (xb, yb) in zip(ancres, ancres[1:]):
        if x <= xb:
            fraction = (x - xa) / (xb - xa)
            return ya + fraction * (yb - ya)
    return ancres[-1][1]


def _score(x: float, ancres: Ancres) -> float:
    """Interpolation, garde-fou ``[0, 100]``, arrondi au centième."""
    brut = _interpoler(x, ancres)
    return round(max(0.0, min(100.0, brut)), 2)


# ──────────────────────────────────────────────────────────────────────
# SOL — pH (eau)
# ──────────────────────────────────────────────────────────────────────
# Optimum agronomique 6.0–7.5, modélisé en tente centrée sur 6.75 → 100.
# Versant acide raide (−0.5 sous 6.0 coûte 35 pts : toxicité aluminique,
# blocage du phosphore). Versant alcalin volontairement plus doux : les
# sols calcaires marocains restent cultivables bien au-delà de 7.5. Chute
# marquée sous 5.5 et au-dessus de 8.5, conformément à l'énoncé.
_SOL: Ancres = (
    (3.0, 0.0),
    (4.0, 12.0),
    (5.0, 30.0),
    (5.5, 55.0),
    (6.0, 90.0),
    (6.75, 100.0),
    (7.5, 90.0),
    (8.5, 62.0),
    (9.5, 38.0),
    (10.5, 16.0),
    (11.5, 0.0),
)


def score_sol(ph: float) -> float:
    """Sous-score /100 de la dimension sol à partir du pH (eau)."""
    ph = _valider_nombre(ph, "ph")
    _exiger_intervalle(ph, "ph", 0.0, 14.0)
    return _score(ph, _SOL)


# ──────────────────────────────────────────────────────────────────────
# CLIMAT — pluviométrie annuelle (mm)
# ──────────────────────────────────────────────────────────────────────
# Étages bioclimatiques d'Emberger appliqués au Maroc : < 200 saharien,
# 200–400 aride, 400–600 semi-aride, > 600 subhumide à humide (Rif, Moyen
# Atlas) — le meilleur pour l'agriculture pluviale, plafonné à 95 (le
# pluvial pur n'est jamais « parfait »). Les nombres de l'énoncé sont les
# scores atteints à la borne haute de chaque tranche.
_CLIMAT: Ancres = (
    (200.0, 25.0),
    (400.0, 55.0),
    (600.0, 85.0),
    (800.0, 95.0),
)


def score_climat(pluvio_mm: float) -> float:
    """Sous-score /100 de la dimension climat à partir de la pluviométrie annuelle (mm)."""
    pluvio_mm = _valider_nombre(pluvio_mm, "pluvio_mm")
    _exiger_non_negatif(pluvio_mm, "pluvio_mm")
    return _score(pluvio_mm, _CLIMAT)


# ──────────────────────────────────────────────────────────────────────
# NDVI — indice moyen sur la parcelle
# ──────────────────────────────────────────────────────────────────────
# Fenêtre saison de croissance. Physiquement dans [-1, 1] : < 0.2 sol nu /
# eau, 0.2–0.4 végétation clairsemée, 0.4–0.6 couvert correct, > 0.6
# couvert dense. Plafonné à 90 : le NDVI reste un proxy, jamais une preuve
# de rendement. Scores de l'énoncé lus à la borne haute de chaque tranche.
_NDVI: Ancres = (
    (0.2, 20.0),
    (0.4, 45.0),
    (0.6, 70.0),
    (0.8, 90.0),
)


def score_ndvi(ndvi_moyen: float) -> float:
    """Sous-score /100 de la dimension NDVI à partir du NDVI moyen."""
    ndvi_moyen = _valider_nombre(ndvi_moyen, "ndvi_moyen")
    _exiger_intervalle(ndvi_moyen, "ndvi_moyen", -1.0, 1.0)
    return _score(ndvi_moyen, _NDVI)


# ──────────────────────────────────────────────────────────────────────
# TOPO — pente moyenne (%)
# ──────────────────────────────────────────────────────────────────────
# Classes FAO de mécanisation : ≤ 2 plaine (mécanisation totale), 2–5
# faible, 5–12 modérée (travail en courbes de niveau), 12–25 forte
# (mécanisation limitée), > 25 très forte (terrasses, culture manuelle).
# Plancher à 10 atteint vers 35 % puis plateau.
_TOPO: Ancres = (
    (2.0, 100.0),
    (5.0, 85.0),
    (12.0, 60.0),
    (25.0, 35.0),
    (35.0, 10.0),
)


def score_topo(pente_pct: float) -> float:
    """Sous-score /100 de la dimension topographie à partir de la pente moyenne (%)."""
    pente_pct = _valider_nombre(pente_pct, "pente_pct")
    _exiger_non_negatif(pente_pct, "pente_pct")
    return _score(pente_pct, _TOPO)


# ──────────────────────────────────────────────────────────────────────
# ACCÈS — distance à la route carrossable (m)
# ──────────────────────────────────────────────────────────────────────
# < 500 accès direct, 500–2000 acceptable, 2000–5000 contraignant (piste,
# surcoût de transport des intrants et de la récolte), > 5000 enclavé.
# Plancher à 25 atteint vers 8000 m puis plateau.
_ACCES: Ancres = (
    (500.0, 95.0),
    (2000.0, 75.0),
    (5000.0, 50.0),
    (8000.0, 25.0),
)


def score_acces(distance_route_m: float) -> float:
    """Sous-score /100 de la dimension accès à partir de la distance à la route (m)."""
    distance_route_m = _valider_nombre(distance_route_m, "distance_route_m")
    _exiger_non_negatif(distance_route_m, "distance_route_m")
    return _score(distance_route_m, _ACCES)
