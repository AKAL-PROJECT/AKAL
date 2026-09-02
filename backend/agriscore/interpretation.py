"""
Couche INTERPRÉTATION du pipeline AgriScore — table de correspondance.

À partir des **valeurs brutes** d'un profil de parcelle (pH, pluviométrie,
pente, texture de sol), renvoie une liste de cultures avec, pour chacune,
un statut ``compatible`` / ``sous_condition`` / ``deconseille`` et une
raison courte.

Référentiel de départ : type FAO Ecocrop, adapté au contexte marocain —
olivier, amandier, céréales pluviales, maraîchage intensif.

⚠️ Cette couche ne produit **que des suggestions**. Elle ne calcule aucun
score, n'importe ni :mod:`agriscore.scoring` ni :mod:`agriscore.aggregation`,
et ne touche jamais au score global. Chaque recommandation porte la réserve
explicite « sous vérification terrain ».

Modèle : ``REFERENTIEL_CULTURES`` est une **table de règles** — une entrée
par culture, une liste de :class:`Regle` déclaratives par entrée. Le moteur
(:func:`suggerer_cultures`) est générique : étendre le référentiel = ajouter
une ligne, jamais toucher au moteur, jamais de ``if`` imbriqué.

Aucune I/O, aucun réseau, aucune dépendance Django.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

# Statuts possibles d'une recommandation, du plus au moins restrictif.
DECONSEILLE = "deconseille"
SOUS_CONDITION = "sous_condition"
COMPATIBLE = "compatible"

_SEVERITE = {DECONSEILLE: 0, SOUS_CONDITION: 1, COMPATIBLE: 2}

#: Réserve portée par CHAQUE recommandation — la couche ne tranche jamais seule.
RESERVE_TERRAIN = "sous vérification terrain"

#: Classes de texture reconnues (extensible).
TEXTURES = ("sableux", "limoneux", "franc", "argileux")

#: Facteurs du profil qu'une règle peut cibler.
FACTEURS = ("ph", "pluvio_mm", "pente_pct", "texture_sol")


# ──────────────────────────────────────────────────────────────────────
# Entrée : profil de parcelle
# ──────────────────────────────────────────────────────────────────────

def _valider_numerique(valeur: Any, nom: str, *, mini: float | None = None,
                       maxi: float | None = None) -> None:
    if valeur is None:
        return
    if isinstance(valeur, bool) or not isinstance(valeur, (int, float)):
        raise TypeError(f"{nom} doit être un nombre ou None, reçu {type(valeur).__name__}")
    if valeur != valeur:  # NaN
        raise ValueError(f"{nom} ne peut pas être NaN")
    if mini is not None and valeur < mini:
        raise ValueError(f"{nom} = {valeur} : en dessous du minimum physique {mini}")
    if maxi is not None and valeur > maxi:
        raise ValueError(f"{nom} = {valeur} : au-dessus du maximum physique {maxi}")


@dataclass(frozen=True)
class ProfilParcelle:
    """Valeurs brutes d'une parcelle. Tout champ peut valoir ``None`` (inconnu).

    Une règle qui cible un facteur ``None`` produit ``sous_condition`` avec
    le motif « donnée non renseignée » — jamais une erreur.
    """

    ph: float | None = None
    pluvio_mm: float | None = None
    pente_pct: float | None = None
    texture_sol: str | None = None

    def __post_init__(self) -> None:
        _valider_numerique(self.ph, "ph", mini=0.0, maxi=14.0)
        _valider_numerique(self.pluvio_mm, "pluvio_mm", mini=0.0)
        _valider_numerique(self.pente_pct, "pente_pct", mini=0.0)
        if self.texture_sol is not None and self.texture_sol not in TEXTURES:
            raise ValueError(
                f"texture_sol inconnue : {self.texture_sol!r} "
                f"(attendu : {', '.join(TEXTURES)} ou None)"
            )


# ──────────────────────────────────────────────────────────────────────
# Brique de règle + prédicats réutilisables
# ──────────────────────────────────────────────────────────────────────

def _jamais(_valeur: Any) -> bool:
    """Clause de rejet par défaut : la règle ne disqualifie jamais la culture."""
    return False


def entre(mini: float, maxi: float) -> Callable[[float], bool]:
    return lambda valeur: mini <= valeur <= maxi


def au_plus(seuil: float) -> Callable[[float], bool]:
    return lambda valeur: valeur <= seuil


def au_moins(seuil: float) -> Callable[[float], bool]:
    return lambda valeur: valeur >= seuil


def sous(seuil: float) -> Callable[[float], bool]:
    return lambda valeur: valeur < seuil


def sur(seuil: float) -> Callable[[float], bool]:
    return lambda valeur: valeur > seuil


def hors(mini: float, maxi: float) -> Callable[[float], bool]:
    return lambda valeur: valeur < mini or valeur > maxi


def parmi(*options: str) -> Callable[[str], bool]:
    return lambda valeur: valeur in options


@dataclass(frozen=True)
class Regle:
    """Contrainte sur un facteur du profil. Évaluée ainsi par le moteur :

    - facteur absent du profil (``None``) → ``sous_condition`` (« donnée non renseignée »)
    - ``rejet(valeur)`` vrai              → ``deconseille``, motif ``si_rejet``
    - ``optimal(valeur)`` vrai            → ``compatible``
    - sinon (bande tolérée)              → ``sous_condition``, motif ``si_marginal``
    """

    facteur: str
    optimal: Callable[[Any], bool]
    si_marginal: str
    rejet: Callable[[Any], bool] = _jamais
    si_rejet: str = ""

    def __post_init__(self) -> None:
        if self.facteur not in FACTEURS:
            raise ValueError(
                f"facteur inconnu : {self.facteur!r} (attendu : {', '.join(FACTEURS)})"
            )
        if not callable(self.optimal) or not callable(self.rejet):
            raise TypeError("optimal et rejet doivent être des prédicats appelables")


# ──────────────────────────────────────────────────────────────────────
# Référentiel : profil → cultures. UNE entrée par culture, à étendre ici.
# ──────────────────────────────────────────────────────────────────────

REFERENTIEL_CULTURES: dict[str, list[Regle]] = {
    "olivier": [
        Regle("ph", entre(6.0, 8.5),
              "pH en limite de l'optimum oléicole (6.0–8.5)",
              rejet=hors(5.3, 8.8), si_rejet="pH hors tolérance de l'olivier (5.3–8.8)"),
        Regle("pluvio_mm", entre(300, 800),
              "pluviométrie hors de l'optimum oléicole (300–800 mm)",
              rejet=sous(150),
              si_rejet="pluviométrie < 150 mm : oléiculture non viable sans irrigation"),
        Regle("pente_pct", au_plus(25),
              "forte pente : plantation en terrasses, mécanisation limitée"),
        Regle("texture_sol", parmi("argileux", "franc", "limoneux"),
              "sol sableux : faible réserve en eau, irrigation d'appoint conseillée"),
    ],
    "amandier": [
        Regle("ph", entre(6.5, 8.0),
              "pH en limite de l'optimum de l'amandier (6.5–8.0)",
              rejet=hors(5.5, 8.5), si_rejet="pH hors tolérance de l'amandier (5.5–8.5)"),
        Regle("pluvio_mm", entre(300, 600),
              "hors de la bande de pluviométrie modérée de l'amandier (300–600 mm)",
              rejet=sous(200),
              si_rejet="pluviométrie < 200 mm : amandiculture non viable sans irrigation"),
        Regle("pente_pct", au_plus(25),
              "forte pente : plantation en terrasses, mécanisation limitée"),
        Regle("texture_sol", parmi("argileux", "franc", "limoneux", "sableux"),
              "texture de sol atypique à vérifier"),
    ],
    "cereales_pluviales": [
        Regle("pluvio_mm", entre(300, 600),
              "hors de l'optimum pluvial 300–600 mm : rendement irrégulier",
              rejet=hors(250, 900),
              si_rejet="pluviométrie hors de la plage viable en bour (250–900 mm)"),
        Regle("ph", entre(5.5, 7.5),
              "pH sous-optimal pour les céréales (optimum 5.5–7.5)",
              rejet=hors(5.0, 8.5), si_rejet="pH hors tolérance des céréales (5.0–8.5)"),
        Regle("pente_pct", au_plus(12),
              "pente > 12 % : érosion, travail obligatoire en courbes de niveau",
              rejet=sur(25), si_rejet="pente > 25 % : mécanisation céréalière impossible"),
        Regle("texture_sol", parmi("franc", "limoneux", "argileux"),
              "sol sableux : faible réserve utile, rendements irréguliers"),
    ],
    "maraichage_intensif": [
        Regle("pluvio_mm", au_moins(600),
              "appoint d'irrigation estival indispensable (pluviométrie 500–600 mm)",
              rejet=sous(500),
              si_rejet="pluviométrie < 500 mm : maraîchage intensif déconseillé sans irrigation"),
        Regle("ph", entre(6.0, 7.5),
              "pH hors de l'optimum maraîcher (6.0–7.5)",
              rejet=hors(5.5, 8.0),
              si_rejet="pH hors tolérance des cultures maraîchères (5.5–8.0)"),
        Regle("pente_pct", au_plus(5),
              "pente 5–12 % : planches en courbes de niveau, irrigation localisée requise",
              rejet=sur(12),
              si_rejet="pente > 12 % : irrigation gravitaire impossible, érosion des planches"),
        Regle("texture_sol", parmi("franc", "limoneux"),
              "sol sableux ou argileux : irrigation et travail du sol à piloter finement"),
    ],
}


# ──────────────────────────────────────────────────────────────────────
# Moteur générique
# ──────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Recommandation:
    """Suggestion pour une culture. Aucune valeur numérique : pas un score."""

    culture: str
    statut: str
    raison: str
    reserve: str = RESERVE_TERRAIN

    def to_dict(self) -> dict:
        return {
            "culture": self.culture,
            "statut": self.statut,
            "raison": self.raison,
            "reserve": self.reserve,
        }


def _evaluer_regle(regle: Regle, profil: ProfilParcelle) -> tuple[str, str | None]:
    valeur = getattr(profil, regle.facteur)
    if valeur is None:
        return SOUS_CONDITION, f"donnée « {regle.facteur} » non renseignée"
    if regle.rejet(valeur):
        return DECONSEILLE, regle.si_rejet
    if regle.optimal(valeur):
        return COMPATIBLE, None
    return SOUS_CONDITION, regle.si_marginal


def _recommander(culture: str, regles: list[Regle], profil: ProfilParcelle) -> Recommandation:
    constats = [_evaluer_regle(regle, profil) for regle in regles]
    statut = min((s for s, _ in constats), key=lambda s: _SEVERITE[s])
    if statut == COMPATIBLE:
        raison = "profil favorable : tous les facteurs testés sont dans l'optimum"
    else:
        motifs = [motif for s, motif in constats if s == statut and motif]
        raison = " ; ".join(dict.fromkeys(motifs))  # dédoublonne, conserve l'ordre
    return Recommandation(culture=culture, statut=statut, raison=raison)


def suggerer_cultures(profil: ProfilParcelle) -> list[Recommandation]:
    """Table profil → cultures compatibles.

    Suggestions uniquement : aucun score calculé, aucun effet sur le score
    global. Chaque item porte la réserve « sous vérification terrain ».

    Args:
        profil: valeurs brutes de la parcelle (champs manquants tolérés).

    Returns:
        Une :class:`Recommandation` par culture de ``REFERENTIEL_CULTURES``,
        dans l'ordre du référentiel.
    """
    if not isinstance(profil, ProfilParcelle):
        raise TypeError("profil doit être un ProfilParcelle")
    return [
        _recommander(culture, regles, profil)
        for culture, regles in REFERENTIEL_CULTURES.items()
    ]
