"""
Signal de modération automatique — palier 1 (règles, zéro coût, zéro
dépendance externe).

Contexte : contrainte projet « aucun palier payant » (cf.
docs/ONBOARDING_SECRETS.md) — l'étude de faisabilité livrée en amont
(docs/AKAL_Repartition_Taches.md, P2-02 : « classif terrain agricole / non
pertinent, local ou API, coût, précision, faux pos/nég, validation
humaine ») recommandait de rester local plutôt que de dépendre d'une API de
modération payante. Ce module en est la première implémentation.

Portée délibérément réduite au SEUL texte (titre + description). Une
première version envisageait aussi :
  - un signal NDVI (agriscore/agents/ndvi_reel.py, déjà câblé pour le
    Passeport) : un terrain réellement agricole peut avoir un NDVI quasi nul
    (jachère, saison sèche, terrain non cultivé, bâtiments agricoles) — le
    signal aurait pénalisé de vrais vendeurs, pas seulement les annonces
    hors sujet.
  - un signal photo (variance de couleur / "aplat suspect") : une vraie
    photo de champ peut être visuellement uniforme (une grande étendue
    d'une seule couleur) — même défaut.
Un signal qu'on ne peut pas distinguer du cas légitime ne doit pas peser
dans un score qui peut faire attendre une vraie annonce en modération.
Écarter ces deux-là plutôt que de les affiner est un choix délibéré, pas un
oubli — à documenter tel quel si le sujet revient (jury, palier 2 futur).

Jamais de rejet automatique : ce module ne fait QUE décider si une annonce
passe par `en_attente` (file de modération, cf. AnnonceAdmin) au lieu de
`en_ligne` directement au moment de la publication — cf.
annonces/serializers.py::AnnonceEcritureSerializer.update(). Un score bas ne
bloque rien : il fait juste attendre un regard humain avant publication,
exactement le « validation humaine » de l'étude d'origine.
"""
import re
import unicodedata
from dataclasses import dataclass, field

# Vocabulaire agricole minimal — mêmes cultures que le Passeport
# (agriscore/interpretation.py : olivier, amandier, céréales pluviales,
# maraîchage intensif) + le vocabulaire courant d'une annonce de terrain
# (statut foncier, accès à l'eau, accès routier — cf. contrat §4). Large
# volontairement : le but est de repérer une annonce SANS AUCUN rapport
# avec un terrain agricole, jamais de juger la qualité d'une vraie
# description.
VOCABULAIRE_AGRICOLE = frozenset({
    "terrain", "hectare", "hectares", "ha", "parcelle", "agricole",
    "culture", "cultures", "cultiver", "cultive", "irrigation", "irrigue",
    "sol", "sols", "puits", "forage", "bour", "pluvial",
    "olivier", "oliviers", "amandier", "amandiers", "cereale", "cereales",
    "maraichage", "verger", "vergers", "arboriculture", "agrume", "agrumes",
    "palmier", "palmiers", "betail", "elevage", "exploitation", "ferme",
    "melkia", "soulaliya", "guich", "habous", "immatricule",
    "titre foncier", "cloture", "cloture", "acces", "piste", "route",
    "recolte", "semis", "labour", "pature", "paturage",
})

# Motifs de spam objectifs — jamais un jugement de contenu, seulement des
# formes structurellement suspectes (lien externe, longue séquence de
# chiffres façon numéro caché dans le texte, ponctuation/majuscules
# excessives). Le vrai contact se fait par la messagerie AKAL, pas par un
# numéro glissé dans la description.
_RE_URL = re.compile(r"https?://|www\.", re.IGNORECASE)
_RE_CHIFFRES_LONGUE_SUITE = re.compile(r"(?:\d[\s.\-]?){8,}")
_RE_PONCTUATION_EXCESSIVE = re.compile(r"[!?]{4,}")

SEUIL_MODERATION = 0.5
LONGUEUR_DESCRIPTION_MIN = 20

# Deux paliers de malus, délibérément :
#   STRUCTUREL — un seul suffit à franchir SEUIL_MODERATION (0,55 > 0,5) :
#   description quasi vide, aucun vocabulaire agricole, ou un lien externe.
#   Chacun, pris seul, est déjà un motif raisonnable d'attente humaine.
#   COSMÉTIQUE — jamais suffisant seul (même logique que le NDVI/la photo
#   écartés de ce module, cf. docstring : un vrai vendeur peut écrire en
#   majuscules, mettre plusieurs points d'exclamation, ou laisser son
#   numéro dans le texte sans que ça ne fasse de son annonce un spam).
#   Ces signaux ne comptent que pour RENFORCER un doute déjà là.
MALUS_STRUCTUREL = 0.55
MALUS_CHIFFRES_LONGUE_SUITE = 0.2
MALUS_PONCTUATION_EXCESSIVE = 0.15
MALUS_MAJUSCULES_EXCESSIVES = 0.2


@dataclass
class SignalModeration:
    """Résultat du scoring — jamais une décision, juste un signal pour
    prioriser la file de modération (cf. docstring du module)."""
    score: float  # 1.0 = aucun signal suspect détecté, 0.0 = tous détectés
    raisons: list[str] = field(default_factory=list)

    @property
    def suspect(self) -> bool:
        return self.score < SEUIL_MODERATION


def evaluer_signal_moderation(titre: str, description: str) -> SignalModeration:
    """Score de plausibilité « annonce de terrain agricole » à partir du
    seul texte (titre + description) — aucune dépendance externe, aucun
    modèle, coût nul, temps de calcul négligeable (appelable en synchrone
    dans le flux de publication, cf. serializers.py)."""
    texte_brut = f"{titre} {description}"
    texte_normalise = _normaliser(texte_brut)
    raisons: list[str] = []
    malus = 0.0

    if len(description.strip()) < LONGUEUR_DESCRIPTION_MIN:
        raisons.append(f"Description très courte (moins de {LONGUEUR_DESCRIPTION_MIN} caractères).")
        malus += MALUS_STRUCTUREL

    if not any(mot in texte_normalise for mot in VOCABULAIRE_AGRICOLE):
        raisons.append("Aucun terme agricole reconnu dans le titre ou la description.")
        malus += MALUS_STRUCTUREL

    if _RE_URL.search(texte_brut):
        raisons.append("Contient un lien (URL) — rare dans une annonce de terrain légitime.")
        malus += MALUS_STRUCTUREL

    if _RE_CHIFFRES_LONGUE_SUITE.search(texte_brut):
        raisons.append("Contient une longue suite de chiffres (numéro glissé dans le texte ?).")
        malus += MALUS_CHIFFRES_LONGUE_SUITE

    if _RE_PONCTUATION_EXCESSIVE.search(texte_brut):
        raisons.append("Ponctuation excessive (!!!! ou ????).")
        malus += MALUS_PONCTUATION_EXCESSIVE

    lettres = [c for c in texte_brut if c.isalpha()]
    if lettres and sum(1 for c in lettres if c.isupper()) / len(lettres) > 0.6:
        raisons.append("Texte très majoritairement en majuscules.")
        malus += MALUS_MAJUSCULES_EXCESSIVES

    return SignalModeration(score=max(0.0, 1.0 - malus), raisons=raisons)


def _normaliser(texte: str) -> str:
    """Minuscule, sans accents, espaces normalisés — même idiome que
    annonces/management/commands/import_scraped_data.py::_normaliser (pas
    factorisé entre les deux : chacun reste un module autonome, cf. sa
    propre docstring)."""
    sans_accents = unicodedata.normalize('NFKD', texte).encode('ascii', 'ignore').decode('ascii')
    return ' '.join(sans_accents.lower().split())
