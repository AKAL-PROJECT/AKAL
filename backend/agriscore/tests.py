"""
Tests du pipeline AgriScore.

- :class:`AgentResultTests` — le contrat ``AgentResult`` se construit, se
  sérialise en dict JSON, reste immuable.
- ``Score*Tests`` — couche SCORING (:mod:`agriscore.scoring`) : bornes,
  paliers interpolés, plateaux, et cas limites (nul, négatif, hors plage,
  non numérique).
- :class:`AgregationTests` — couche AGRÉGATION (:mod:`agriscore.aggregation`) :
  pondération effective, renormalisation (dont un cas dimension indisponible,
  vérifié au chiffre près), fiabilité, garde-fous d'entrée.
- :class:`InterpretationTests` — couche INTERPRÉTATION
  (:mod:`agriscore.interpretation`) : table profil → cultures sur des profils
  types, statuts et réserve « sous vérification terrain », zéro score produit.
- :class:`PipelineIntegrationTests` — couche COLLECTE simulée + orchestrateur
  (:mod:`agriscore.agents`, :mod:`agriscore.orchestrateur`) : coordonnées →
  Passeport JSON complet, bout en bout, sans aucune API.
"""

import json
import math
import time
from datetime import date, datetime
from dataclasses import FrozenInstanceError
from unittest.mock import Mock, patch

import requests
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import DatabaseError
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APITestCase

from agriscore import AgentResult
from agriscore.aggregation import POIDS_NOMINAUX, agreger_scores
from agriscore.agents import (
    AGENTS_DEFAUT,
    AGENTS_SIMULES,
    Agent,
    AgentSimule,
    AgentAccesReel,
    AgentAccesSimule,
    AgentClimatReel,
    AgentClimatSimule,
    AgentNdviReel,
    AgentNdviSimule,
    AgentSolReel,
    AgentSolSimule,
    AgentTopoOpenMeteo,
    AgentTopoReel,
    AgentTopoSimule,
)
from agriscore.agents.acces_reel import _extraire as _extraire_acces
from agriscore.agents.climat_reel import _agreger as _agreger_climat
from agriscore.agents.ndvi_reel import _agreger_serie, _fenetre_12_mois
from agriscore.agents.sol_reel import _classe_texture
from agriscore.agents.topo_openmeteo import (
    _altitude_et_pente as _altitude_et_pente_om,
    _grille_points as _grille_points_om,
)
from agriscore.agents.topo_reel import _altitude_et_pente, _emprise, _parser_aaigrid
from agriscore.models import ConfigurationAgriScore
from agriscore.orchestrateur import generer_passeport

_CACHE_LOCMEM = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "agriscore-tests",
    }
}


@override_settings(CACHES=_CACHE_LOCMEM)
class AgentReelTestCase(SimpleTestCase):
    """Base des tests d'agents réels : cache isolé (LocMem), vidé à chaque test."""

    def setUp(self):
        super().setUp()
        cache.clear()
        self.addCleanup(cache.clear)
from agriscore.interpretation import (
    COMPATIBLE,
    DECONSEILLE,
    REFERENTIEL_CULTURES,
    RESERVE_TERRAIN,
    SOUS_CONDITION,
    ProfilParcelle,
    Regle,
    entre,
    suggerer_cultures,
)
from agriscore.scoring import (
    score_acces,
    score_climat,
    score_ndvi,
    score_sol,
    score_topo,
)

CHAMPS_ATTENDUS = {
    "dimension",
    "statut",
    "mode",
    "valeurs",
    "source",
    "date_collecte",
    "confiance",
    "resolution_m",
    "zone_tampon_m",
}


def _resultat_valide(**overrides) -> AgentResult:
    """Fabrique un ``AgentResult`` cohérent (dimension NDVI, mode réel)."""
    base = dict(
        dimension="ndvi",
        statut="ok",
        mode="reel",
        valeurs={"ndvi_moyen": 0.62, "n_observations": 14},
        source="sentinel-2-l2a",
        date_collecte="2026-08-31T10:15:00+00:00",
        confiance=0.87,
        resolution_m=10,
        zone_tampon_m=50,
    )
    base.update(overrides)
    return AgentResult(**base)


class AgentResultTests(SimpleTestCase):
    def test_se_construit_avec_des_valeurs_valides(self):
        resultat = _resultat_valide()

        self.assertEqual(resultat.dimension, "ndvi")
        self.assertEqual(resultat.statut, "ok")
        self.assertEqual(resultat.mode, "reel")
        self.assertEqual(resultat.valeurs["ndvi_moyen"], 0.62)
        self.assertEqual(resultat.confiance, 0.87)
        self.assertEqual(resultat.resolution_m, 10)
        self.assertEqual(resultat.zone_tampon_m, 50)

    def test_se_serialise_en_dict_json(self):
        # resolution_m nullable : on vérifie que None traverse la sérialisation.
        resultat = _resultat_valide(mode="simule", resolution_m=None)

        donnees = resultat.to_dict()

        self.assertEqual(set(donnees), CHAMPS_ATTENDUS)
        self.assertEqual(donnees["dimension"], "ndvi")
        self.assertEqual(donnees["mode"], "simule")
        self.assertIsNone(donnees["resolution_m"])
        self.assertEqual(donnees["valeurs"], {"ndvi_moyen": 0.62, "n_observations": 14})
        # Sérialisable sans adaptateur, et round-trip stable.
        self.assertEqual(json.loads(json.dumps(donnees)), donnees)
        # Copie défensive : muter la sortie ne touche pas l'objet figé.
        donnees["valeurs"]["ndvi_moyen"] = 999
        self.assertEqual(resultat.valeurs["ndvi_moyen"], 0.62)

    def test_est_immuable(self):
        resultat = _resultat_valide()

        with self.assertRaises(FrozenInstanceError):
            resultat.confiance = 0.1


# ══════════════════════════════════════════════════════════════════════
# Couche SCORING
# ══════════════════════════════════════════════════════════════════════

TOUTES_LES_FONCTIONS = (score_sol, score_climat, score_ndvi, score_topo, score_acces)


def _interpolation_attendue(x, ancres):
    """Oracle indépendant : interpolation linéaire + plateaux + garde-fou [0, 100].

    Réimplémenté à la main (sans appeler ``agriscore.scoring``) pour valider
    la courbe sur tout le domaine — bornes, segments et plateaux — sans se
    reposer sur le code testé.
    """
    if x <= ancres[0][0]:
        y = ancres[0][1]
    elif x >= ancres[-1][0]:
        y = ancres[-1][1]
    else:
        for (xa, ya), (xb, yb) in zip(ancres, ancres[1:]):
            if xa <= x <= xb:
                y = ya + (x - xa) / (xb - xa) * (yb - ya)
                break
    return max(0.0, min(100.0, y))


class ScoreSolTests(SimpleTestCase):
    """pH → sous-score. Tente centrée sur 6.75, versant alcalin plus doux."""

    def test_bornes_des_ancres(self):
        cas = {
            3.0: 0.0,
            4.0: 12.0,
            5.0: 30.0,
            5.5: 55.0,
            6.0: 90.0,
            6.75: 100.0,
            7.5: 90.0,
            8.5: 62.0,
            9.5: 38.0,
            10.5: 16.0,
            11.5: 0.0,
        }
        for ph, attendu in cas.items():
            with self.subTest(ph=ph):
                self.assertAlmostEqual(score_sol(ph), attendu, places=2)

    def test_interpolation_lineaire_entre_ancres(self):
        # Milieux de segment → moyenne des deux ancres encadrantes.
        self.assertAlmostEqual(score_sol(6.375), 95.0, places=2)   # 6.0–6.75
        self.assertAlmostEqual(score_sol(7.125), 95.0, places=2)   # 6.75–7.5
        self.assertAlmostEqual(score_sol(8.0), 76.0, places=2)     # 7.5–8.5
        self.assertAlmostEqual(score_sol(4.5), 21.0, places=2)     # 4.0–5.0

    def test_optimum_domine_les_flancs(self):
        self.assertGreater(score_sol(6.75), score_sol(6.0))
        self.assertGreater(score_sol(6.75), score_sol(7.5))
        # Versant alcalin plus doux : à distance égale de l'optimum, l'acide perd plus.
        self.assertGreater(score_sol(7.75), score_sol(5.75))

    def test_plateaux_hors_ancres(self):
        self.assertAlmostEqual(score_sol(0.0), 0.0, places=2)      # valeur nulle
        self.assertAlmostEqual(score_sol(2.0), 0.0, places=2)
        self.assertAlmostEqual(score_sol(14.0), 0.0, places=2)

    def test_penalise_les_extremes_de_l_enonce(self):
        self.assertLess(score_sol(5.4), score_sol(5.5))
        self.assertLess(score_sol(8.6), score_sol(8.5))
        self.assertLess(score_sol(5.0), 40.0)
        self.assertLess(score_sol(9.0), 60.0)

    def test_hors_domaine_physique(self):
        for ph in (-0.1, -1.0, 14.1, 20.0):
            with self.subTest(ph=ph), self.assertRaises(ValueError):
                score_sol(ph)


class ScoreClimatTests(SimpleTestCase):
    """Pluviométrie annuelle (mm) → sous-score, croissant puis plateau à 95."""

    def test_bornes_des_ancres(self):
        cas = {200: 25.0, 400: 55.0, 600: 85.0, 800: 95.0}
        for mm, attendu in cas.items():
            with self.subTest(pluvio_mm=mm):
                self.assertAlmostEqual(score_climat(mm), attendu, places=2)

    def test_interpolation_lineaire(self):
        self.assertAlmostEqual(score_climat(300), 40.0, places=2)
        self.assertAlmostEqual(score_climat(500), 70.0, places=2)
        self.assertAlmostEqual(score_climat(700), 90.0, places=2)

    def test_plateau_bas_sous_200(self):
        self.assertAlmostEqual(score_climat(0), 25.0, places=2)     # valeur nulle
        self.assertAlmostEqual(score_climat(50), 25.0, places=2)
        self.assertAlmostEqual(score_climat(199.9), 25.0, places=1)

    def test_plateau_haut_au_dela_de_800(self):
        self.assertAlmostEqual(score_climat(1200), 95.0, places=2)
        self.assertAlmostEqual(score_climat(50_000), 95.0, places=2)

    def test_strictement_croissant_sur_la_plage_utile(self):
        precedent = -1.0
        for mm in range(200, 801, 25):
            actuel = score_climat(mm)
            self.assertGreater(actuel, precedent)
            precedent = actuel

    def test_pluviometrie_negative(self):
        for mm in (-0.1, -50, -1000):
            with self.subTest(pluvio_mm=mm), self.assertRaises(ValueError):
                score_climat(mm)


class ScoreNdviTests(SimpleTestCase):
    """NDVI moyen → sous-score, croissant, plafonné à 90."""

    def test_bornes_des_ancres(self):
        cas = {0.2: 20.0, 0.4: 45.0, 0.6: 70.0, 0.8: 90.0}
        for ndvi, attendu in cas.items():
            with self.subTest(ndvi_moyen=ndvi):
                self.assertAlmostEqual(score_ndvi(ndvi), attendu, places=2)

    def test_interpolation_lineaire(self):
        self.assertAlmostEqual(score_ndvi(0.3), 32.5, places=2)
        self.assertAlmostEqual(score_ndvi(0.5), 57.5, places=2)
        self.assertAlmostEqual(score_ndvi(0.7), 80.0, places=2)

    def test_plateau_bas_inclut_zero_et_negatif(self):
        # NDVI < 0 est physique (eau, sol nu humide) : accepté, score plancher.
        self.assertAlmostEqual(score_ndvi(0.0), 20.0, places=2)     # valeur nulle
        self.assertAlmostEqual(score_ndvi(-0.3), 20.0, places=2)    # négatif valide
        self.assertAlmostEqual(score_ndvi(-1.0), 20.0, places=2)
        self.assertAlmostEqual(score_ndvi(0.1), 20.0, places=2)

    def test_plateau_haut(self):
        self.assertAlmostEqual(score_ndvi(0.9), 90.0, places=2)
        self.assertAlmostEqual(score_ndvi(1.0), 90.0, places=2)

    def test_hors_domaine_physique(self):
        for ndvi in (-1.01, -2.0, 1.01, 5.0):
            with self.subTest(ndvi_moyen=ndvi), self.assertRaises(ValueError):
                score_ndvi(ndvi)


class ScoreTopoTests(SimpleTestCase):
    """Pente (%) → sous-score, décroissant, plancher à 10."""

    def test_bornes_des_ancres(self):
        cas = {2: 100.0, 5: 85.0, 12: 60.0, 25: 35.0, 35: 10.0}
        for pente, attendu in cas.items():
            with self.subTest(pente_pct=pente):
                self.assertAlmostEqual(score_topo(pente), attendu, places=2)

    def test_interpolation_lineaire(self):
        self.assertAlmostEqual(score_topo(3.5), 92.5, places=2)
        self.assertAlmostEqual(score_topo(8.5), 72.5, places=2)
        self.assertAlmostEqual(score_topo(18.5), 47.5, places=2)
        self.assertAlmostEqual(score_topo(30), 22.5, places=2)

    def test_plateau_bas_terrain_plat(self):
        self.assertAlmostEqual(score_topo(0), 100.0, places=2)      # valeur nulle
        self.assertAlmostEqual(score_topo(1), 100.0, places=2)
        self.assertAlmostEqual(score_topo(2), 100.0, places=2)

    def test_plateau_haut_terrain_abrupt(self):
        self.assertAlmostEqual(score_topo(35), 10.0, places=2)
        self.assertAlmostEqual(score_topo(80), 10.0, places=2)
        self.assertAlmostEqual(score_topo(1000), 10.0, places=2)

    def test_strictement_decroissant_sur_la_plage_utile(self):
        precedent = 101.0
        for pente in range(2, 36):
            actuel = score_topo(pente)
            self.assertLess(actuel, precedent)
            precedent = actuel

    def test_pente_negative(self):
        for pente in (-0.1, -5, -100):
            with self.subTest(pente_pct=pente), self.assertRaises(ValueError):
                score_topo(pente)


class ScoreAccesTests(SimpleTestCase):
    """Distance à la route (m) → sous-score, décroissant, plancher à 25."""

    def test_bornes_des_ancres(self):
        cas = {500: 95.0, 2000: 75.0, 5000: 50.0, 8000: 25.0}
        for distance, attendu in cas.items():
            with self.subTest(distance_route_m=distance):
                self.assertAlmostEqual(score_acces(distance), attendu, places=2)

    def test_interpolation_lineaire(self):
        self.assertAlmostEqual(score_acces(1250), 85.0, places=2)
        self.assertAlmostEqual(score_acces(3500), 62.5, places=2)
        self.assertAlmostEqual(score_acces(6500), 37.5, places=2)

    def test_plateau_bas_acces_direct(self):
        self.assertAlmostEqual(score_acces(0), 95.0, places=2)      # valeur nulle
        self.assertAlmostEqual(score_acces(250), 95.0, places=2)
        self.assertAlmostEqual(score_acces(500), 95.0, places=2)

    def test_plateau_haut_enclave(self):
        self.assertAlmostEqual(score_acces(8000), 25.0, places=2)
        self.assertAlmostEqual(score_acces(20_000), 25.0, places=2)
        self.assertAlmostEqual(score_acces(1_000_000), 25.0, places=2)

    def test_distance_negative(self):
        for distance in (-0.1, -500, -10_000):
            with self.subTest(distance_route_m=distance), self.assertRaises(ValueError):
                score_acces(distance)


class ScoringProprietesCommunesTests(SimpleTestCase):
    """Invariants partagés par les cinq fonctions."""

    ENTREES_VALIDES = {
        score_sol: (0.0, 5.5, 6.75, 8.5, 14.0),
        score_climat: (0, 150, 350, 550, 900, 5000),
        score_ndvi: (-1.0, -0.2, 0.0, 0.35, 0.65, 1.0),
        score_topo: (0, 1.5, 7, 20, 45, 300),
        score_acces: (0, 400, 1500, 4000, 9000, 100_000),
    }

    def test_resultat_toujours_dans_zero_cent(self):
        for fonction, entrees in self.ENTREES_VALIDES.items():
            for x in entrees:
                with self.subTest(fonction=fonction.__name__, x=x):
                    score = fonction(x)
                    self.assertGreaterEqual(score, 0.0)
                    self.assertLessEqual(score, 100.0)

    def test_resultat_est_un_float(self):
        for fonction, entrees in self.ENTREES_VALIDES.items():
            for x in entrees:
                with self.subTest(fonction=fonction.__name__, x=x):
                    self.assertIsInstance(fonction(x), float)

    def test_courbe_conforme_a_l_interpolation_lineaire(self):
        # Balayage fin de tout le domaine : la sortie colle à l'oracle
        # (interpolation linéaire + plateaux). Couvre d'un coup les bornes,
        # l'intérieur des segments et les plateaux.
        from agriscore.scoring import _ACCES, _CLIMAT, _NDVI, _SOL, _TOPO

        grilles = {
            score_sol: (_SOL, [i / 20 for i in range(0, 281)]),        # 0 → 14, pas 0.05
            score_climat: (_CLIMAT, list(range(0, 1201, 10))),
            score_ndvi: (_NDVI, [i / 100 for i in range(-100, 101)]),  # -1 → 1, pas 0.01
            score_topo: (_TOPO, [i / 4 for i in range(0, 241)]),       # 0 → 60, pas 0.25
            score_acces: (_ACCES, list(range(0, 12001, 25))),
        }
        for fonction, (ancres, grille) in grilles.items():
            for x in grille:
                with self.subTest(fonction=fonction.__name__, x=x):
                    # 0.01 d'arrondi au centième + petite marge flottante.
                    self.assertLess(
                        abs(fonction(x) - _interpolation_attendue(x, ancres)), 0.02
                    )

    def test_pas_de_discontinuite_aux_jointures(self):
        # À chaque ancre, limites gauche et droite quasi confondues : aucune
        # « marche brutale » entre deux paliers.
        from agriscore.scoring import _ACCES, _CLIMAT, _NDVI, _SOL, _TOPO

        eps = 1e-6
        for fonction, ancres in (
            (score_sol, _SOL),
            (score_climat, _CLIMAT),
            (score_ndvi, _NDVI),
            (score_topo, _TOPO),
            (score_acces, _ACCES),
        ):
            for x, _y in ancres:
                centre = fonction(x)
                with self.subTest(fonction=fonction.__name__, x=x):
                    self.assertLess(abs(fonction(x - eps) - centre), 0.05)
                    self.assertLess(abs(fonction(x + eps) - centre), 0.05)

    def test_entree_none_leve_type_error(self):
        for fonction in TOUTES_LES_FONCTIONS:
            with self.subTest(fonction=fonction.__name__), self.assertRaises(TypeError):
                fonction(None)

    def test_entree_non_numerique_leve_type_error(self):
        for fonction in TOUTES_LES_FONCTIONS:
            for mauvaise in ("7", [1], {}, object()):
                with self.subTest(fonction=fonction.__name__, valeur=mauvaise):
                    with self.assertRaises(TypeError):
                        fonction(mauvaise)

    def test_bool_rejete(self):
        # True vaut 1, False vaut 0 : jamais une donnée agronomique valide.
        for fonction in TOUTES_LES_FONCTIONS:
            for booleen in (True, False):
                with self.subTest(fonction=fonction.__name__, valeur=booleen):
                    with self.assertRaises(TypeError):
                        fonction(booleen)

    def test_nan_et_infini_leve_value_error(self):
        for fonction in TOUTES_LES_FONCTIONS:
            for mauvaise in (float("nan"), float("inf"), float("-inf")):
                with self.subTest(fonction=fonction.__name__, valeur=mauvaise):
                    with self.assertRaises(ValueError):
                        fonction(mauvaise)

    def test_int_et_float_donnent_le_meme_score(self):
        self.assertEqual(score_climat(400), score_climat(400.0))
        self.assertEqual(score_topo(12), score_topo(12.0))
        self.assertEqual(score_acces(2000), score_acces(2000.0))


# ══════════════════════════════════════════════════════════════════════
# Couche AGRÉGATION
# ══════════════════════════════════════════════════════════════════════

_DIMS = ("ndvi", "climat", "sol", "topo", "acces")


def _resultats_pipeline(confiances=None, statuts=None):
    """Les cinq AgentResult d'un run, confiance 1.0 et statut 'ok' par défaut."""
    confiances = confiances or {}
    statuts = statuts or {}
    return [
        AgentResult(
            dimension=dim,
            statut=statuts.get(dim, "ok"),
            mode="simule",
            valeurs={},
            source="test",
            date_collecte="2026-08-31T00:00:00+00:00",
            confiance=confiances.get(dim, 1.0),
            resolution_m=None,
            zone_tampon_m=0,
        )
        for dim in _DIMS
    ]


class AgregationTests(SimpleTestCase):
    def test_toutes_confiances_pleines_poids_nominaux(self):
        sous_scores = {"ndvi": 100, "climat": 50, "sol": 50, "topo": 50, "acces": 0}

        out = agreger_scores(_resultats_pipeline(), sous_scores)

        # Confiances = 1 → poids effectifs = nominaux, Σ = 100, pas de renorm.
        # score = (100·25 + 50·20 + 50·20 + 50·20 + 0·15) / 100 = 5500 / 100
        self.assertEqual(out["score_global"], 55.0)
        self.assertEqual(out["fiabilite_globale"], 100.0)

        detail = out["detail_par_dimension"]
        self.assertEqual(detail["ndvi"]["poids_effectif_renormalise"], 25.0)
        self.assertEqual(detail["climat"]["poids_effectif_renormalise"], 20.0)
        self.assertEqual(detail["acces"]["poids_effectif_renormalise"], 15.0)
        self.assertEqual(detail["ndvi"]["contribution"], 25.0)
        self.assertEqual(detail["acces"]["contribution"], 0.0)
        self.assertAlmostEqual(
            sum(d["contribution"] for d in detail.values()), out["score_global"], places=2
        )

    def test_confiances_partielles_renormalisation(self):
        confiances = {"ndvi": 0.9, "climat": 0.8, "sol": 1.0, "topo": 0.7, "acces": 0.6}
        sous_scores = {"ndvi": 80, "climat": 60, "sol": 70, "topo": 50, "acces": 90}

        out = agreger_scores(_resultats_pipeline(confiances), sous_scores)
        detail = out["detail_par_dimension"]

        # Poids effectifs : 22.5, 16, 20, 14, 9 → Σ 81.5
        self.assertEqual(detail["ndvi"]["poids_effectif"], 22.5)
        self.assertEqual(detail["climat"]["poids_effectif"], 16.0)
        self.assertEqual(detail["topo"]["poids_effectif"], 14.0)
        # Renormalisés (× 100 / 81.5)
        self.assertAlmostEqual(detail["ndvi"]["poids_effectif_renormalise"], 27.6074, places=4)
        self.assertAlmostEqual(detail["climat"]["poids_effectif_renormalise"], 19.6319, places=4)
        self.assertAlmostEqual(detail["sol"]["poids_effectif_renormalise"], 24.5399, places=4)
        self.assertAlmostEqual(detail["topo"]["poids_effectif_renormalise"], 17.1779, places=4)
        self.assertAlmostEqual(detail["acces"]["poids_effectif_renormalise"], 11.0429, places=4)
        self.assertAlmostEqual(
            sum(d["poids_effectif_renormalise"] for d in detail.values()), 100.0, places=3
        )

        # score = Σ(sous-score · poids effectif) / Σ poids effectif = 5670 / 81.5
        self.assertAlmostEqual(out["score_global"], 69.57, places=2)
        # fiabilité = 0.9·25 + 0.8·20 + 1.0·20 + 0.7·20 + 0.6·15
        self.assertEqual(out["fiabilite_globale"], 81.5)

    def test_dimension_indisponible_renormalise_au_chiffre_pres(self):
        # Topo indisponible : la confiance 0.5 de l'AgentResult est ignorée,
        # forcée à 0. Les 20 points nominaux de Topo se redistribuent sur les
        # quatre dimensions restantes (renorm × 100 / 80 = × 1.25).
        confiances = {"ndvi": 1.0, "climat": 1.0, "sol": 1.0, "topo": 0.5, "acces": 1.0}
        statuts = {"topo": "indisponible"}
        sous_scores = {"ndvi": 80, "climat": 60, "sol": 90, "acces": 40}  # sans topo

        out = agreger_scores(_resultats_pipeline(confiances, statuts), sous_scores)
        detail = out["detail_par_dimension"]

        # Topo sort entièrement du calcul.
        self.assertEqual(detail["topo"]["confiance"], 0.0)
        self.assertEqual(detail["topo"]["poids_effectif"], 0.0)
        self.assertEqual(detail["topo"]["poids_effectif_renormalise"], 0.0)
        self.assertEqual(detail["topo"]["contribution"], 0.0)
        self.assertIsNone(detail["topo"]["sous_score"])

        # Renormalisation exacte (poids effectifs 25, 20, 20, 0, 15 → Σ 80).
        self.assertEqual(detail["ndvi"]["poids_effectif_renormalise"], 31.25)
        self.assertEqual(detail["climat"]["poids_effectif_renormalise"], 25.0)
        self.assertEqual(detail["sol"]["poids_effectif_renormalise"], 25.0)
        self.assertEqual(detail["acces"]["poids_effectif_renormalise"], 18.75)
        self.assertEqual(
            sum(d["poids_effectif_renormalise"] for d in detail.values()), 100.0
        )

        # Contributions : 80·0.3125 + 60·0.25 + 90·0.25 + 0 + 40·0.1875
        #               = 25.0 + 15.0 + 22.5 + 0 + 7.5 = 70.0
        self.assertEqual(detail["ndvi"]["contribution"], 25.0)
        self.assertEqual(detail["climat"]["contribution"], 15.0)
        self.assertEqual(detail["sol"]["contribution"], 22.5)
        self.assertEqual(detail["acces"]["contribution"], 7.5)
        self.assertEqual(out["score_global"], 70.0)

        # Fiabilité : 1·25 + 1·20 + 1·20 + 0·20 + 1·15 = 80.0 (plafond : Topo perdu).
        self.assertEqual(out["fiabilite_globale"], 80.0)

    def test_fiabilite_reflete_les_confiances_pas_les_scores(self):
        confiances = {"ndvi": 0.5, "climat": 1.0, "sol": 1.0, "topo": 1.0, "acces": 1.0}
        sous_scores = {d: 50 for d in _DIMS}

        out = agreger_scores(_resultats_pipeline(confiances), sous_scores)

        # Tous les sous-scores égaux → moyenne pondérée = 50, quelle que soit la pondération.
        self.assertEqual(out["score_global"], 50.0)
        # fiabilité = 0.5·25 + 20 + 20 + 20 + 15 = 87.5
        self.assertEqual(out["fiabilite_globale"], 87.5)

    def test_toutes_dimensions_indisponibles_score_none(self):
        statuts = {d: "indisponible" for d in _DIMS}

        out = agreger_scores(_resultats_pipeline(statuts=statuts), {})

        self.assertIsNone(out["score_global"])
        self.assertEqual(out["fiabilite_globale"], 0.0)
        for ligne in out["detail_par_dimension"].values():
            self.assertEqual(ligne["statut"], "indisponible")
            self.assertEqual(ligne["poids_effectif"], 0.0)
            self.assertEqual(ligne["poids_effectif_renormalise"], 0.0)
            self.assertEqual(ligne["contribution"], 0.0)

    def test_forme_de_la_sortie(self):
        out = agreger_scores(_resultats_pipeline(), {d: 60 for d in _DIMS})

        self.assertEqual(
            set(out), {"score_global", "fiabilite_globale", "detail_par_dimension"}
        )
        detail = out["detail_par_dimension"]
        self.assertEqual(list(detail), list(_DIMS))
        self.assertEqual(
            set(detail["ndvi"]),
            {
                "statut",
                "sous_score",
                "confiance",
                "poids_nominal",
                "poids_effectif",
                "poids_effectif_renormalise",
                "contribution",
            },
        )
        self.assertEqual(
            {d: detail[d]["poids_nominal"] for d in detail},
            {"ndvi": 25, "climat": 20, "sol": 20, "topo": 20, "acces": 15},
        )
        json.dumps(out)  # transite vers l'endpoint interne → doit être JSON

    def test_poids_nominaux_personnalises(self):
        # Poids configurables (2026-09-11) — cinq poids égaux (20 chacun,
        # somme 100 comme l'exige _valider_poids) plutôt que les poids
        # nominaux par défaut (25/20/20/20/15) : prouve que le paramètre
        # change réellement le calcul, pas seulement accepté et ignoré.
        poids_egaux = {"ndvi": 20, "climat": 20, "sol": 20, "topo": 20, "acces": 20}
        sous_scores = {"ndvi": 100, "climat": 50, "sol": 50, "topo": 50, "acces": 0}

        out = agreger_scores(_resultats_pipeline(), sous_scores, poids_egaux)

        # Confiances = 1 → pas de renormalisation, poids nominaux = effectifs.
        # score = (100+50+50+50+0)·20 / 100 = 50.0 (55.0 avec les poids par
        # défaut, cf. test_toutes_confiances_pleines_poids_nominaux ci-dessus).
        self.assertEqual(out["score_global"], 50.0)
        self.assertEqual(out["fiabilite_globale"], 100.0)
        self.assertEqual(
            {d: out["detail_par_dimension"][d]["poids_nominal"] for d in _DIMS},
            poids_egaux,
        )

    def test_entrees_invalides(self):
        base_scores = {d: 50 for d in _DIMS}

        with self.subTest("dimension manquante"):
            with self.assertRaises(ValueError):
                agreger_scores(_resultats_pipeline()[:4], base_scores)

        with self.subTest("dimension en double"):
            doublon = _resultats_pipeline()
            doublon.append(doublon[0])
            with self.assertRaises(ValueError):
                agreger_scores(doublon, base_scores)

        with self.subTest("sous-score manquant pour une dimension ok"):
            with self.assertRaises(ValueError):
                agreger_scores(
                    _resultats_pipeline(),
                    {"ndvi": 50, "climat": 50, "sol": 50, "topo": 50},
                )

        with self.subTest("sous-score hors [0, 100]"):
            with self.assertRaises(ValueError):
                agreger_scores(_resultats_pipeline(), {**base_scores, "ndvi": 140})

        with self.subTest("sous-score dimension inconnue"):
            with self.assertRaises(ValueError):
                agreger_scores(_resultats_pipeline(), {**base_scores, "hydro": 50})

        with self.subTest("sous_scores n'est pas un mapping"):
            with self.assertRaises(TypeError):
                agreger_scores(_resultats_pipeline(), [50, 50, 50, 50, 50])

        with self.subTest("resultats contient un intrus"):
            intrus = _resultats_pipeline()
            intrus[2] = {"dimension": "sol"}
            with self.assertRaises(TypeError):
                agreger_scores(intrus, base_scores)

        with self.subTest("poids_nominaux ne somme pas à 100"):
            with self.assertRaises(ValueError):
                agreger_scores(
                    _resultats_pipeline(), base_scores,
                    {"ndvi": 30, "climat": 20, "sol": 20, "topo": 20, "acces": 15},
                )

        with self.subTest("poids_nominaux dimension manquante"):
            with self.assertRaises(ValueError):
                agreger_scores(
                    _resultats_pipeline(), base_scores,
                    {"ndvi": 25, "climat": 20, "sol": 20, "topo": 35},
                )

        with self.subTest("poids_nominaux dimension inconnue"):
            with self.assertRaises(ValueError):
                agreger_scores(
                    _resultats_pipeline(), base_scores,
                    {"ndvi": 25, "climat": 20, "sol": 20, "topo": 20, "acces": 15, "hydro": 0},
                )

        with self.subTest("poids_nominaux valeur négative"):
            with self.assertRaises(ValueError):
                agreger_scores(
                    _resultats_pipeline(), base_scores,
                    {"ndvi": -5, "climat": 20, "sol": 20, "topo": 20, "acces": 45},
                )

        with self.subTest("poids_nominaux n'est pas un mapping"):
            with self.assertRaises(TypeError):
                agreger_scores(_resultats_pipeline(), base_scores, [25, 20, 20, 20, 15])


# ══════════════════════════════════════════════════════════════════════
# Couche INTERPRÉTATION
# ══════════════════════════════════════════════════════════════════════

# Profils types (contexte marocain).
PROFIL_MEKNES = ProfilParcelle(ph=7.2, pluvio_mm=500, pente_pct=4, texture_sol="argileux")
PROFIL_SOUSS_ARIDE = ProfilParcelle(ph=8.2, pluvio_mm=180, pente_pct=8, texture_sol="sableux")
PROFIL_RIF_PENTU = ProfilParcelle(ph=5.8, pluvio_mm=900, pente_pct=30, texture_sol="limoneux")
PROFIL_PARTIEL = ProfilParcelle(ph=7.0)  # seul le pH est connu


def _par_culture(profil):
    return {reco.culture: reco for reco in suggerer_cultures(profil)}


class InterpretationTests(SimpleTestCase):
    def test_profil_meknes_favorable(self):
        recos = _par_culture(PROFIL_MEKNES)

        # pH neutre, pluvio 500, faible pente, sol argileux : arboriculture et
        # céréales pluviales dans l'optimum.
        self.assertEqual(recos["olivier"].statut, COMPATIBLE)
        self.assertEqual(recos["amandier"].statut, COMPATIBLE)
        self.assertEqual(recos["cereales_pluviales"].statut, COMPATIBLE)
        # Maraîchage intensif : 500 mm sans irrigation → réserve, pas compatible.
        self.assertEqual(recos["maraichage_intensif"].statut, SOUS_CONDITION)
        self.assertIn("irrigation", recos["maraichage_intensif"].raison.lower())

    def test_profil_souss_aride(self):
        recos = _par_culture(PROFIL_SOUSS_ARIDE)

        # 180 mm : seul l'olivier tient (sous condition), le reste est déconseillé.
        self.assertEqual(recos["olivier"].statut, SOUS_CONDITION)
        self.assertEqual(recos["amandier"].statut, DECONSEILLE)
        self.assertEqual(recos["cereales_pluviales"].statut, DECONSEILLE)
        self.assertEqual(recos["maraichage_intensif"].statut, DECONSEILLE)
        self.assertIn("200 mm", recos["amandier"].raison)
        self.assertIn("500 mm", recos["maraichage_intensif"].raison)

    def test_profil_rif_humide_pentu(self):
        recos = _par_culture(PROFIL_RIF_PENTU)

        # Pluie abondante mais pente 30 % : culture annuelle mécanisée exclue,
        # arbres possibles en terrasses (sous condition).
        self.assertEqual(recos["olivier"].statut, SOUS_CONDITION)
        self.assertEqual(recos["amandier"].statut, SOUS_CONDITION)
        self.assertEqual(recos["cereales_pluviales"].statut, DECONSEILLE)
        self.assertEqual(recos["maraichage_intensif"].statut, DECONSEILLE)
        self.assertIn("pente", recos["cereales_pluviales"].raison.lower())

    def test_profil_donnees_partielles(self):
        recos = _par_culture(PROFIL_PARTIEL)

        # pH 7.0 convient partout, mais les trois autres facteurs manquent :
        # tout ressort « sous condition », jamais une erreur, jamais compatible.
        for culture, reco in recos.items():
            with self.subTest(culture=culture):
                self.assertEqual(reco.statut, SOUS_CONDITION)
                self.assertIn("non renseignée", reco.raison)

    def test_sortie_structure_et_reserve_terrain(self):
        recos = suggerer_cultures(PROFIL_MEKNES)

        self.assertEqual([r.culture for r in recos], list(REFERENTIEL_CULTURES))
        for reco in recos:
            with self.subTest(culture=reco.culture):
                self.assertIn(reco.statut, {COMPATIBLE, SOUS_CONDITION, DECONSEILLE})
                self.assertTrue(reco.raison)  # raison courte, non vide
                self.assertEqual(reco.reserve, RESERVE_TERRAIN)
                self.assertEqual(reco.reserve, "sous vérification terrain")

    def test_ne_produit_aucun_score(self):
        # La couche ne renvoie QUE du texte : pas de champ numérique, aucune
        # clé « score », rien qui puisse être confondu avec le score global.
        for reco in suggerer_cultures(PROFIL_MEKNES):
            donnees = reco.to_dict()
            self.assertEqual(
                set(donnees), {"culture", "statut", "raison", "reserve"}
            )
            for valeur in donnees.values():
                self.assertIsInstance(valeur, str)
            self.assertNotIn("score", " ".join(donnees).lower())

    def test_import_ne_touche_pas_aux_couches_de_score(self):
        import ast

        import agriscore.interpretation as module

        with open(module.__file__, encoding="utf-8") as fichier:
            arbre = ast.parse(fichier.read())
        importes: set[str] = set()
        for noeud in ast.walk(arbre):
            if isinstance(noeud, ast.Import):
                importes.update(alias.name for alias in noeud.names)
            elif isinstance(noeud, ast.ImportFrom):
                importes.add(noeud.module or "")
        self.assertNotIn("agriscore.scoring", importes)
        self.assertNotIn("agriscore.aggregation", importes)

    def test_fonction_pure_entree_inchangee(self):
        profil = ProfilParcelle(ph=6.5, pluvio_mm=450, pente_pct=10, texture_sol="franc")

        premier = [r.to_dict() for r in suggerer_cultures(profil)]
        second = [r.to_dict() for r in suggerer_cultures(profil)]

        self.assertEqual(premier, second)
        # ProfilParcelle est frozen : la couche ne peut pas le modifier.
        self.assertEqual(profil.ph, 6.5)
        with self.assertRaises(Exception):
            profil.ph = 7.0

    def test_profil_parcelle_valide_ses_entrees(self):
        with self.subTest("texture inconnue"):
            with self.assertRaises(ValueError):
                ProfilParcelle(texture_sol="volcanique")
        with self.subTest("pH hors domaine"):
            with self.assertRaises(ValueError):
                ProfilParcelle(ph=15.0)
        with self.subTest("pluviométrie négative"):
            with self.assertRaises(ValueError):
                ProfilParcelle(pluvio_mm=-10)
        with self.subTest("pente non numérique"):
            with self.assertRaises(TypeError):
                ProfilParcelle(pente_pct="forte")
        with self.subTest("profil vide accepté"):
            self.assertEqual(len(suggerer_cultures(ProfilParcelle())), len(REFERENTIEL_CULTURES))

    def test_suggerer_cultures_exige_un_profil_parcelle(self):
        with self.assertRaises(TypeError):
            suggerer_cultures({"ph": 7.0})

    def test_table_de_regles_extensible(self):
        # Le moteur est générique : une culture ad hoc, définie uniquement par
        # des Regle, s'évalue sans toucher au moteur ni au référentiel.
        regles = [
            Regle("ph", entre(6.0, 7.0), "pH limite"),
            Regle("pluvio_mm", entre(400, 800), "pluviométrie limite"),
        ]
        from agriscore.interpretation import _recommander

        favorable = _recommander("culture_test", regles, ProfilParcelle(ph=6.5, pluvio_mm=600))
        self.assertEqual(favorable.statut, COMPATIBLE)

        limite = _recommander("culture_test", regles, ProfilParcelle(ph=6.5, pluvio_mm=200))
        self.assertEqual(limite.statut, SOUS_CONDITION)
        self.assertIn("pluviométrie limite", limite.raison)

    def test_regle_refuse_un_facteur_inconnu(self):
        with self.assertRaises(ValueError):
            Regle("humidite_air", entre(0, 100), "hors sujet")


# ══════════════════════════════════════════════════════════════════════
# Couche COLLECTE simulée + orchestrateur
# ══════════════════════════════════════════════════════════════════════

# Marrakech (les agents simulés ignorent les coordonnées).
_LAT, _LON = 31.63, -7.99

_CLES_PASSEPORT = {
    "genere_le",
    "mode",
    "score_global",
    "fiabilite_globale",
    "dimensions",
    "dimensions_indisponibles",
    "cultures_suggerees",
    "avertissement",
}


class _AgentSolEnPanne(Agent):
    """Agent réel fictif qui échoue à collecter (test fail-open)."""

    dimension = "sol"
    source = "test-panne"

    def _collecter_valeurs(self, lat, lon):
        raise RuntimeError("source de données injoignable")


class _AgentSolValeurAberrante(Agent):
    """Agent qui répond « ok » mais avec une valeur inscorable (pH 99)."""

    dimension = "sol"
    source = "test-aberrant"

    def _collecter_valeurs(self, lat, lon):
        return {"ph_eau": 99.0, "type_sol": "argileux"}, 0.5


class _AgentLent(AgentSimule):
    """Agent simulé qui dort — pour prouver que la collecte est parallèle."""

    source = "test-lent"

    def __init__(self, dimension: str, delai_s: float = 0.2):
        self.dimension = dimension
        self._delai_s = delai_s

    def _collecter_valeurs(self, lat, lon):
        time.sleep(self._delai_s)
        return {"_": 1}, 0.5


def _sans_sol_simule():
    return (
        AgentClimatSimule(),
        AgentNdviSimule(),
        AgentTopoSimule(),
        AgentAccesSimule(),
    )


class PipelineIntegrationTests(SimpleTestCase):
    """Pipeline 100 % simulé (agents=AGENTS_SIMULES) — run hors-ligne déterministe."""

    def test_coordonnees_vers_passeport_complet(self):
        passeport = generer_passeport(_LAT, _LON, agents=AGENTS_SIMULES)

        self.assertEqual(set(passeport), _CLES_PASSEPORT)
        # Les coordonnées ne sont JAMAIS dans le passeport : endpoint public,
        # les renvoyer contournerait le floutage d'une annonce confidentielle.
        self.assertNotIn("coordonnees", passeport)
        self.assertEqual(passeport["mode"], "simule")
        self.assertEqual(
            set(passeport["dimensions"]), {"sol", "climat", "ndvi", "topo", "acces"}
        )
        self.assertEqual(passeport["dimensions_indisponibles"], [])
        self.assertIn("simul", passeport["avertissement"].lower())
        datetime.fromisoformat(passeport["genere_le"])  # ISO 8601

        for dim, bloc in passeport["dimensions"].items():
            with self.subTest(dimension=dim):
                self.assertEqual(bloc["statut"], "ok")
                self.assertEqual(bloc["mode"], "simule")
                self.assertIsInstance(bloc["sous_score"], float)
                self.assertGreaterEqual(bloc["sous_score"], 0.0)
                self.assertLessEqual(bloc["sous_score"], 100.0)
                datetime.fromisoformat(bloc["date_collecte"])

        # Valeurs du prototype propagées jusqu'au Passeport.
        v = passeport["dimensions"]
        self.assertEqual(v["sol"]["valeurs"]["ph_eau"], 7.4)
        self.assertEqual(v["climat"]["valeurs"]["pluviometrie_mm"], 510)
        self.assertEqual(v["ndvi"]["valeurs"]["ndvi_moyen"], 0.71)
        self.assertEqual(v["topo"]["valeurs"]["pente_pct"], 2.0)
        self.assertEqual(v["acces"]["valeurs"]["distance_route_m"], 1100)

        # Cultures suggérées présentes, chacune sous réserve terrain.
        cultures = passeport["cultures_suggerees"]
        self.assertEqual(
            [c["culture"] for c in cultures],
            ["olivier", "amandier", "cereales_pluviales", "maraichage_intensif"],
        )
        for reco in cultures:
            self.assertEqual(reco["reserve"], "sous vérification terrain")

        json.dumps(passeport)  # Passeport JSON complet

    def test_score_et_fiabilite_coherents(self):
        passeport = generer_passeport(_LAT, _LON, agents=AGENTS_SIMULES)
        blocs = passeport["dimensions"].values()
        sous_scores = [b["sous_score"] for b in blocs]

        # Le score global est une moyenne pondérée → borné par les sous-scores.
        self.assertGreaterEqual(passeport["score_global"], min(sous_scores))
        self.assertLessEqual(passeport["score_global"], max(sous_scores))

        # Fiabilité = Σ(confiance × poids nominal) ; toutes les confiances < 1
        # (données simulées) → fiabilité < 100.
        attendu = sum(b["confiance"] * b["poids_nominal"] for b in blocs)
        self.assertAlmostEqual(passeport["fiabilite_globale"], round(attendu, 2), places=2)
        self.assertLess(passeport["fiabilite_globale"], 100.0)
        self.assertGreater(passeport["fiabilite_globale"], 0.0)

        # Σ des contributions = score global (à l'arrondi près).
        contributions = sum(b["contribution"] for b in blocs)
        self.assertAlmostEqual(contributions, passeport["score_global"], places=1)

    def test_valeurs_prototype_scores_attendus(self):
        # Golden : sous-scores dérivés de pH 7.4 / 510 mm / NDVI 0.71 / 2 % / 1100 m
        # et confiances simulées 0.80 / 0.80 / 0.85 / 0.90 / 0.75.
        d = generer_passeport(_LAT, _LON, agents=AGENTS_SIMULES)
        blocs = d["dimensions"]
        self.assertAlmostEqual(blocs["sol"]["sous_score"], 91.33, places=2)
        self.assertAlmostEqual(blocs["climat"]["sous_score"], 71.5, places=2)
        self.assertAlmostEqual(blocs["ndvi"]["sous_score"], 81.0, places=2)
        self.assertAlmostEqual(blocs["topo"]["sous_score"], 100.0, places=2)
        self.assertAlmostEqual(blocs["acces"]["sous_score"], 87.0, places=2)
        self.assertAlmostEqual(d["score_global"], 86.12, places=2)
        self.assertAlmostEqual(d["fiabilite_globale"], 82.5, places=2)

    def test_scores_deterministes(self):
        p1 = generer_passeport(_LAT, _LON, agents=AGENTS_SIMULES)
        p2 = generer_passeport(_LAT, _LON, agents=AGENTS_SIMULES)
        self.assertEqual(p1["score_global"], p2["score_global"])
        self.assertEqual(p1["fiabilite_globale"], p2["fiabilite_globale"])
        self.assertEqual(
            {k: v["sous_score"] for k, v in p1["dimensions"].items()},
            {k: v["sous_score"] for k, v in p2["dimensions"].items()},
        )

    def test_coordonnees_invalides(self):
        for lat, lon in [(200.0, 0.0), (0.0, 999.0), ("x", 0.0), (None, None), (float("nan"), 0.0)]:
            with self.subTest(lat=lat, lon=lon):
                with self.assertRaises((TypeError, ValueError)):
                    generer_passeport(lat, lon)

    def test_collecte_parallele_preserve_l_ordre_des_dimensions(self):
        # La collecte est parallèle mais l'ordre d'entrée des agents est
        # conservé → le dict `dimensions` reste déterministe.
        ordre_inhabituel = (
            AgentAccesSimule(), AgentSolSimule(), AgentNdviSimule(),
            AgentClimatSimule(), AgentTopoSimule(),
        )
        passeport = generer_passeport(_LAT, _LON, agents=ordre_inhabituel)
        self.assertEqual(
            list(passeport["dimensions"].keys()),
            ["acces", "sol", "ndvi", "climat", "topo"],
        )

    def test_collecte_parallele_plus_rapide_que_sequentiel(self):
        from agriscore.orchestrateur import _collecter

        agents = [_AgentLent(dim, delai_s=0.2) for dim in ("sol", "climat", "ndvi")]
        t0 = time.monotonic()
        resultats = _collecter(agents, _LAT, _LON)
        ecoule = time.monotonic() - t0

        self.assertEqual([r.dimension for r in resultats], ["sol", "climat", "ndvi"])
        # Séquentiel : 3 × 0,2 s = 0,6 s. Parallèle : ≈ 0,2 s. Marge large.
        self.assertLess(ecoule, 0.5)

    def test_agent_en_panne_degrade_sans_casser(self):
        agents = (_AgentSolEnPanne(), *_sans_sol_simule())

        passeport = generer_passeport(_LAT, _LON, agents=agents)

        self.assertEqual(passeport["dimensions"]["sol"]["statut"], "indisponible")
        self.assertIsNone(passeport["dimensions"]["sol"]["sous_score"])
        self.assertEqual(passeport["dimensions"]["sol"]["confiance"], 0.0)
        self.assertEqual(passeport["dimensions"]["sol"]["contribution"], 0.0)
        # Les 4 autres dimensions restent exploitées.
        for dim in ("climat", "ndvi", "topo", "acces"):
            self.assertEqual(passeport["dimensions"][dim]["statut"], "ok")
        # Le score est toujours produit, la fiabilité chute (Sol perdu).
        self.assertIsNotNone(passeport["score_global"])
        self.assertLess(passeport["fiabilite_globale"], 82.5)
        # La dimension perdue est signalée explicitement.
        self.assertEqual(passeport["dimensions_indisponibles"], ["sol"])
        self.assertIn("partiel", passeport["avertissement"].lower())
        json.dumps(passeport)

    def test_agent_ok_mais_valeur_inscorable_est_retrogradee(self):
        agents = (_AgentSolValeurAberrante(), *_sans_sol_simule())

        passeport = generer_passeport(_LAT, _LON, agents=agents)

        self.assertEqual(passeport["dimensions"]["sol"]["statut"], "indisponible")
        self.assertIsNone(passeport["dimensions"]["sol"]["sous_score"])
        self.assertIsNotNone(passeport["score_global"])

    def test_agents_simules_produisent_des_agent_results_valides(self):
        self.assertEqual(len(AGENTS_SIMULES), 5)
        self.assertEqual(
            {a.dimension for a in AGENTS_SIMULES},
            {"sol", "climat", "ndvi", "topo", "acces"},
        )
        for agent in AGENTS_SIMULES:
            with self.subTest(agent=type(agent).__name__):
                resultat = agent.collecter(_LAT, _LON)
                self.assertIsInstance(resultat, AgentResult)
                self.assertEqual(resultat.mode, "simule")
                self.assertEqual(resultat.statut, "ok")
                datetime.fromisoformat(resultat.date_collecte)

    def test_agent_est_abstrait(self):
        with self.assertRaises(TypeError):
            Agent()  # _collecter_valeurs non implémenté

    def test_collecte_ne_fait_aucun_appel_reseau(self):
        import ast

        import agriscore.agents.base as base
        import agriscore.agents.simules as simules
        import agriscore.orchestrateur as orch

        reseau = {"requests", "urllib", "http", "httpx", "socket", "aiohttp", "ftplib"}
        for module in (base, simules, orch):
            arbre = ast.parse(open(module.__file__, encoding="utf-8").read())
            importes = set()
            for noeud in ast.walk(arbre):
                if isinstance(noeud, ast.Import):
                    importes.update(a.name.split(".")[0] for a in noeud.names)
                elif isinstance(noeud, ast.ImportFrom) and noeud.module:
                    importes.add(noeud.module.split(".")[0])
            with self.subTest(module=module.__name__):
                self.assertEqual(importes & reseau, set())


# ══════════════════════════════════════════════════════════════════════
# Premier agent réel — Topo (Copernicus GLO-30 / OpenTopography)
# ══════════════════════════════════════════════════════════════════════

_LAT_R, _LON_R = 31.63, -7.99

# Grilles AAIGrid de test (5×5). Plate → pente 0 ; inclinée → +10 m par colonne (est).
_GRILLE_PLATE = [[480.0] * 5 for _ in range(5)]
_GRILLE_INCLINEE = [[400.0 + 10.0 * col for col in range(5)] for _ in range(5)]


def _aaigrid(lignes, *, cellsize=0.00027, xllcorner=-8.0, yllcorner=31.6, nodata=-9999.0):
    ncols, nrows = len(lignes[0]), len(lignes)
    entete = (
        f"ncols {ncols}\nnrows {nrows}\n"
        f"xllcorner {xllcorner}\nyllcorner {yllcorner}\n"
        f"cellsize {cellsize}\nNODATA_value {nodata}\n"
    )
    corps = "\n".join(" ".join(f"{v}" for v in ligne) for ligne in lignes)
    return entete + corps + "\n"


def _reponse_ok(texte):
    reponse = Mock()
    reponse.text = texte
    reponse.raise_for_status = Mock(return_value=None)
    return reponse


def _reponse_elevation(altitudes):
    """Mock d'une réponse Open-Meteo Elevation : ``{"elevation": [...]}``."""
    reponse = Mock()
    reponse.json = Mock(return_value={"elevation": list(altitudes)})
    reponse.raise_for_status = Mock(return_value=None)
    return reponse


class AgentTopoReelPurTests(SimpleTestCase):
    """Fonctions pures de parsing / calcul de l'agent topo réel."""

    def test_parser_aaigrid(self):
        grille = _parser_aaigrid(_aaigrid(_GRILLE_INCLINEE, cellsize=0.00027))
        self.assertEqual((grille.ncols, grille.nrows), (5, 5))
        self.assertEqual(grille.cellsize_deg, 0.00027)
        self.assertEqual(grille.lignes[0], [400.0, 410.0, 420.0, 430.0, 440.0])
        self.assertEqual(grille.altitude(2, 2), 420.0)

    def test_parser_aaigrid_tronque(self):
        with self.assertRaises(ValueError):
            _parser_aaigrid("ncols 5\nnrows 5\ncellsize 0.00027\nNODATA_value -9999\n1 2 3\n")

    def test_altitude_et_pente_terrain_plat(self):
        grille = _parser_aaigrid(_aaigrid(_GRILLE_PLATE))
        altitude, pente = _altitude_et_pente(grille, _LAT_R)
        self.assertEqual(altitude, 480.0)
        self.assertAlmostEqual(pente, 0.0, places=6)

    def test_altitude_et_pente_terrain_incline(self):
        cellsize = 0.00027
        grille = _parser_aaigrid(_aaigrid(_GRILLE_INCLINEE, cellsize=cellsize))
        altitude, pente = _altitude_et_pente(grille, _LAT_R)
        self.assertEqual(altitude, 420.0)
        # Oracle indépendant : +10 m sur une cellule, pente % = 100·(10 / pas_x).
        pas_x = cellsize * 111_320.0 * math.cos(math.radians(_LAT_R))
        self.assertAlmostEqual(pente, 100.0 * 10.0 / pas_x, places=4)

    def test_altitude_et_pente_grille_trop_petite(self):
        grille = _parser_aaigrid("ncols 2\nnrows 2\ncellsize 0.00027\nNODATA_value -9999\n1 2 3 4\n")
        with self.assertRaises(ValueError):
            _altitude_et_pente(grille, _LAT_R)

    def test_emprise_rayon_150m(self):
        sud, nord, ouest, est = _emprise(_LAT_R, _LON_R, 150)
        self.assertAlmostEqual((nord - sud) / 2 * 111_320.0, 150.0, places=3)
        largeur_m = (est - ouest) / 2 * 111_320.0 * math.cos(math.radians(_LAT_R))
        self.assertAlmostEqual(largeur_m, 150.0, places=3)
        self.assertLess(sud, nord)
        self.assertLess(ouest, est)


class AgentTopoReelTests(AgentReelTestCase):
    def test_cas_nominal_mock_de_l_api(self):
        session = Mock()
        session.get.return_value = _reponse_ok(_aaigrid(_GRILLE_INCLINEE, cellsize=0.00027))
        agent = AgentTopoReel(api_key="CLE_TEST", session=session)

        resultat = agent.collecter(_LAT_R, _LON_R)

        self.assertIsInstance(resultat, AgentResult)
        self.assertEqual(resultat.statut, "ok")
        self.assertEqual(resultat.mode, "reel")
        self.assertEqual(resultat.resolution_m, 30)
        self.assertEqual(resultat.zone_tampon_m, 150)
        self.assertIn("Copernicus", resultat.source)
        self.assertIn("OpenTopography", resultat.source)
        self.assertEqual(resultat.valeurs["altitude_m"], 420.0)
        self.assertGreater(resultat.valeurs["pente_pct"], 0.0)
        self.assertEqual(resultat.valeurs["dem"], "COP30")
        self.assertGreaterEqual(resultat.confiance, 0.0)
        self.assertLessEqual(resultat.confiance, 1.0)
        datetime.fromisoformat(resultat.date_collecte)

        # L'appel HTTP : timeout fourni, emprise ~150 m, bons paramètres.
        args, kwargs = session.get.call_args
        self.assertIn("timeout", kwargs)
        self.assertGreater(kwargs["timeout"], 0)
        params = kwargs["params"]
        self.assertEqual(params["demtype"], "COP30")
        self.assertEqual(params["outputFormat"], "AAIGrid")
        self.assertEqual(params["API_Key"], "CLE_TEST")
        self.assertAlmostEqual((params["north"] - params["south"]) / 2 * 111_320.0, 150.0, places=2)

    def test_timeout_donne_indisponible_propre(self):
        session = Mock()
        session.get.side_effect = requests.exceptions.Timeout("timed out")
        agent = AgentTopoReel(api_key="CLE_TEST", timeout_s=3.0, session=session)

        with self.assertLogs("agriscore.agents.topo_reel", "WARNING"):
            resultat = agent.collecter(_LAT_R, _LON_R)  # ne doit jamais lever

        self.assertEqual(resultat.statut, "indisponible")
        self.assertEqual(resultat.mode, "reel")
        self.assertEqual(resultat.confiance, 0.0)
        self.assertEqual(resultat.valeurs, {})
        self.assertEqual(resultat.resolution_m, 30)
        datetime.fromisoformat(resultat.date_collecte)
        # Le timeout demandé a bien été transmis à requests.
        self.assertEqual(session.get.call_args.kwargs["timeout"], 3.0)

    def test_erreur_http_donne_indisponible(self):
        reponse = Mock()
        reponse.raise_for_status.side_effect = requests.exceptions.HTTPError("500 Server Error")
        session = Mock()
        session.get.return_value = reponse
        agent = AgentTopoReel(api_key="CLE_TEST", session=session)

        with self.assertLogs("agriscore.agents.topo_reel", "WARNING"):
            self.assertEqual(agent.collecter(_LAT_R, _LON_R).statut, "indisponible")

    def test_connexion_impossible_donne_indisponible(self):
        session = Mock()
        session.get.side_effect = requests.exceptions.ConnectionError("connection refused")
        agent = AgentTopoReel(api_key="CLE_TEST", session=session)

        with self.assertLogs("agriscore.agents.topo_reel", "WARNING"):
            self.assertEqual(agent.collecter(_LAT_R, _LON_R).statut, "indisponible")

    def test_nodata_au_centre_donne_indisponible(self):
        grille = [[480.0] * 5 for _ in range(5)]
        grille[2][2] = -9999.0
        session = Mock()
        session.get.return_value = _reponse_ok(_aaigrid(grille))
        agent = AgentTopoReel(api_key="CLE_TEST", session=session)

        with self.assertLogs("agriscore.agents.topo_reel", "WARNING"):
            self.assertEqual(agent.collecter(_LAT_R, _LON_R).statut, "indisponible")

    def test_cle_api_absente_pas_d_appel_reseau(self):
        session = Mock()
        agent = AgentTopoReel(api_key="", session=session)

        with self.assertLogs("agriscore.agents.topo_reel", "WARNING"):
            resultat = agent.collecter(_LAT_R, _LON_R)

        self.assertEqual(resultat.statut, "indisponible")
        session.get.assert_not_called()

    def test_coordonnees_invalides_remontent(self):
        # Une entrée invalide du pipeline n'est pas un échec d'agent : elle lève.
        agent = AgentTopoReel(api_key="CLE_TEST", session=Mock())
        with self.assertRaises((TypeError, ValueError)):
            agent.collecter(200.0, 0.0)


class PipelineAvecTopoReelTests(AgentReelTestCase):
    def _agents(self, topo):
        return (
            AgentSolSimule(),
            AgentClimatSimule(),
            AgentNdviSimule(),
            topo,
            AgentAccesSimule(),
        )

    def test_composition_par_defaut_tous_reels(self):
        self.assertEqual(
            [type(a).__name__ for a in AGENTS_DEFAUT],
            [
                "AgentSolReel",
                "AgentClimatReel",
                "AgentNdviReel",
                "AgentTopoOpenMeteo",
                "AgentAccesReel",
            ],
        )
        self.assertTrue(all(a.mode == "reel" for a in AGENTS_DEFAUT))
        # Topo par défaut = Open-Meteo (keyless) ; OpenTopography reste dispo.
        self.assertEqual([a.dimension for a in AGENTS_DEFAUT].count("topo"), 1)

    def test_pipeline_topo_reel_nominal(self):
        session = Mock()
        session.get.return_value = _reponse_ok(_aaigrid(_GRILLE_PLATE))
        topo = AgentTopoReel(api_key="CLE_TEST", session=session)

        passeport = generer_passeport(_LAT_R, _LON_R, agents=self._agents(topo))

        self.assertEqual(passeport["mode"], "mixte")
        self.assertEqual(passeport["dimensions_indisponibles"], [])
        topo_bloc = passeport["dimensions"]["topo"]
        self.assertEqual(topo_bloc["statut"], "ok")
        self.assertEqual(topo_bloc["mode"], "reel")
        self.assertEqual(topo_bloc["valeurs"]["altitude_m"], 480.0)
        self.assertAlmostEqual(topo_bloc["sous_score"], 100.0, places=2)  # pente 0 % → 100
        for dim in ("sol", "climat", "ndvi", "acces"):
            self.assertEqual(passeport["dimensions"][dim]["mode"], "simule")
        self.assertIsNotNone(passeport["score_global"])
        json.dumps(passeport)

    def test_pipeline_ne_plante_pas_si_topo_reel_timeout(self):
        session = Mock()
        session.get.side_effect = requests.exceptions.Timeout("timed out")
        topo = AgentTopoReel(api_key="CLE_TEST", session=session)

        with self.assertLogs("agriscore.agents.topo_reel", "WARNING"):
            passeport = generer_passeport(_LAT_R, _LON_R, agents=self._agents(topo))

        topo_bloc = passeport["dimensions"]["topo"]
        self.assertEqual(topo_bloc["statut"], "indisponible")
        self.assertIsNone(topo_bloc["sous_score"])
        self.assertEqual(topo_bloc["contribution"], 0.0)
        for dim in ("sol", "climat", "ndvi", "acces"):
            self.assertEqual(passeport["dimensions"][dim]["statut"], "ok")
        self.assertIsNotNone(passeport["score_global"])
        # Topo (poids nominal 20) perdu → fiabilité plafonnée à 80.
        self.assertLessEqual(passeport["fiabilite_globale"], 80.0)
        # Dimension perdue signalée ; les 4 autres sont simulées → mode "simule".
        self.assertEqual(passeport["dimensions_indisponibles"], ["topo"])
        self.assertEqual(passeport["mode"], "simule")
        self.assertIn("relief", passeport["avertissement"].lower())


# ══════════════════════════════════════════════════════════════════════
# Agent topo PAR DÉFAUT — Open-Meteo Elevation (GLO-90, keyless)
# ══════════════════════════════════════════════════════════════════════

class AgentTopoOpenMeteoPurTests(SimpleTestCase):
    """Grille de points + calcul de pente de l'agent topo Open-Meteo."""

    def test_grille_9_points_centre_au_milieu(self):
        points = _grille_points_om(_LAT_R, _LON_R)
        self.assertEqual(len(points), 9)
        # Indice 4 = centre exact.
        self.assertEqual(points[4], (_LAT_R, _LON_R))
        # Rangée 0 = nord (lat > centre), rangée 2 = sud.
        self.assertGreater(points[0][0], points[4][0])
        self.assertLess(points[8][0], points[4][0])
        # Pas ≈ 90 m en latitude entre deux rangées.
        d_nord_m = (points[1][0] - points[7][0]) / 2 * 111_320.0
        self.assertAlmostEqual(d_nord_m, 90.0, places=2)

    def test_pente_terrain_plat(self):
        altitude, pente = _altitude_et_pente_om([480.0] * 9)
        self.assertEqual(altitude, 480.0)
        self.assertAlmostEqual(pente, 0.0, places=6)

    def test_pente_gradient_est(self):
        # +10 m par pas vers l'est, invariant nord-sud.
        altitudes = [400.0 + 10.0 * d_c for _ in range(3) for d_c in (-1, 0, 1)]
        altitude, pente = _altitude_et_pente_om(altitudes)
        self.assertEqual(altitude, 400.0)
        # Oracle : pente % = 100 · (Δest−ouest) / (2 · pas) = 100 · 20 / 180.
        self.assertAlmostEqual(pente, 100.0 * 20.0 / 180.0, places=6)

    def test_grille_incomplete_leve(self):
        with self.assertRaises(ValueError):
            _altitude_et_pente_om([480.0] * 8)

    def test_altitude_manquante_leve(self):
        grille = [480.0] * 9
        grille[3] = None
        with self.assertRaises(ValueError):
            _altitude_et_pente_om(grille)


class AgentTopoOpenMeteoTests(AgentReelTestCase):
    def test_cas_nominal_mock(self):
        session = Mock()
        session.get.return_value = _reponse_elevation(
            [400.0 + 5.0 * d_c for _ in range(3) for d_c in (-1, 0, 1)]
        )
        agent = AgentTopoOpenMeteo(session=session)

        resultat = agent.collecter(_LAT_R, _LON_R)

        self.assertEqual(resultat.statut, "ok")
        self.assertEqual(resultat.mode, "reel")
        self.assertEqual(resultat.resolution_m, 90)
        self.assertIn("GLO-90", resultat.source)
        self.assertIn("Open-Meteo", resultat.source)
        self.assertEqual(resultat.valeurs["altitude_m"], 400.0)
        self.assertEqual(resultat.valeurs["dem"], "GLO-90")
        self.assertGreater(resultat.valeurs["pente_pct"], 0.0)
        self.assertEqual(resultat.confiance, 0.85)
        datetime.fromisoformat(resultat.date_collecte)

        # Un seul appel, 9 points en latitude/longitude, timeout transmis.
        kwargs = session.get.call_args.kwargs
        self.assertGreater(kwargs["timeout"], 0)
        self.assertEqual(len(kwargs["params"]["latitude"].split(",")), 9)
        self.assertEqual(len(kwargs["params"]["longitude"].split(",")), 9)

    def test_timeout_donne_indisponible(self):
        session = Mock()
        session.get.side_effect = requests.exceptions.Timeout("timed out")
        agent = AgentTopoOpenMeteo(timeout_s=3.0, session=session)

        with self.assertLogs("agriscore.agents.topo_openmeteo", "WARNING"):
            resultat = agent.collecter(_LAT_R, _LON_R)

        self.assertEqual(resultat.statut, "indisponible")
        self.assertEqual(resultat.valeurs, {})
        self.assertEqual(session.get.call_args.kwargs["timeout"], 3.0)

    def test_erreur_http_donne_indisponible(self):
        reponse = Mock()
        reponse.raise_for_status.side_effect = requests.exceptions.HTTPError("500")
        session = Mock()
        session.get.return_value = reponse
        agent = AgentTopoOpenMeteo(session=session)

        with self.assertLogs("agriscore.agents.topo_openmeteo", "WARNING"):
            self.assertEqual(agent.collecter(_LAT_R, _LON_R).statut, "indisponible")

    def test_reponse_malformee_donne_indisponible(self):
        session = Mock()
        session.get.return_value = _reponse_elevation([480.0] * 3)  # 3 ≠ 9
        agent = AgentTopoOpenMeteo(session=session)

        with self.assertLogs("agriscore.agents.topo_openmeteo", "WARNING"):
            self.assertEqual(agent.collecter(_LAT_R, _LON_R).statut, "indisponible")

    def test_coordonnees_invalides_remontent(self):
        agent = AgentTopoOpenMeteo(session=Mock())
        with self.assertRaises((TypeError, ValueError)):
            agent.collecter(200.0, 0.0)

    def test_integration_pipeline_topo_par_defaut(self):
        session = Mock()
        session.get.return_value = _reponse_elevation([500.0] * 9)  # plat → pente 0
        agents = (
            AgentSolSimule(), AgentClimatSimule(), AgentNdviSimule(),
            AgentTopoOpenMeteo(session=session), AgentAccesSimule(),
        )

        passeport = generer_passeport(_LAT_R, _LON_R, agents=agents)

        topo_bloc = passeport["dimensions"]["topo"]
        self.assertEqual(topo_bloc["statut"], "ok")
        self.assertEqual(topo_bloc["mode"], "reel")
        self.assertEqual(topo_bloc["valeurs"]["dem"], "GLO-90")
        self.assertAlmostEqual(topo_bloc["sous_score"], 100.0, places=2)
        self.assertEqual(passeport["dimensions_indisponibles"], [])
        self.assertEqual(passeport["mode"], "mixte")


# ══════════════════════════════════════════════════════════════════════
# Les 4 agents réels restants — Climat / Sol / Accès / NDVI
# ══════════════════════════════════════════════════════════════════════

def _reponse_json(payload, *, ok=True):
    reponse = Mock()
    reponse.json = Mock(return_value=payload)
    reponse.raise_for_status = Mock(
        return_value=None if ok else None,
        side_effect=None if ok else requests.exceptions.HTTPError("500"),
    )
    return reponse


# -- Climat (Open-Meteo) -----------------------------------------------

_OPENMETEO_OK = {
    "daily": {
        "time": [f"j{i}" for i in range(20)],
        "precipitation_sum": [2.0] * 20,
        "temperature_2m_mean": [18.0] * 20,
    }
}


class AgentClimatReelTests(AgentReelTestCase):
    def test_agreger_pluviometrie_annuelle(self):
        pluvio, temp, couverture = _agreger_climat(_OPENMETEO_OK)
        self.assertAlmostEqual(pluvio, 2.0 * 365.25, places=2)  # moyenne journalière × 365.25
        self.assertEqual(temp, 18.0)
        self.assertEqual(couverture, 1.0)

    def test_agreger_jours_manquants_baisse_la_couverture(self):
        donnees = {"daily": {"precipitation_sum": [2.0] * 8 + [None, None]}}
        pluvio, _temp, couverture = _agreger_climat(donnees)
        self.assertEqual(couverture, 0.8)
        self.assertAlmostEqual(pluvio, 2.0 * 365.25, places=2)  # moyenne des jours valides

    def test_agreger_serie_vide_leve(self):
        for donnees in ({}, {"daily": {}}, {"daily": {"precipitation_sum": []}},
                        {"daily": {"precipitation_sum": [None, None]}}):
            with self.subTest(donnees=donnees), self.assertRaises(ValueError):
                _agreger_climat(donnees)

    def test_cas_nominal_mock(self):
        session = Mock()
        session.get.return_value = _reponse_json(_OPENMETEO_OK)
        agent = AgentClimatReel(session=session)

        r = agent.collecter(31.63, -7.99)

        self.assertEqual(r.statut, "ok")
        self.assertEqual(r.mode, "reel")
        self.assertIn("Open-Meteo", r.source)
        self.assertIn("ERA5", r.source)
        self.assertAlmostEqual(r.valeurs["pluviometrie_mm"], round(2.0 * 365.25, 1), places=1)
        self.assertEqual(r.valeurs["temperature_moyenne_c"], 18.0)
        self.assertEqual(r.confiance, 0.85)
        params = session.get.call_args.kwargs["params"]
        self.assertEqual(params["start_date"], "1991-01-01")
        self.assertGreater(session.get.call_args.kwargs["timeout"], 0)

    def test_echec_reseau_donne_indisponible(self):
        session = Mock()
        session.get.side_effect = requests.exceptions.Timeout("timed out")
        agent = AgentClimatReel(timeout_s=4.0, session=session)

        with self.assertLogs("agriscore.agents.climat_reel", "WARNING"):
            r = agent.collecter(31.63, -7.99)

        self.assertEqual(r.statut, "indisponible")
        self.assertEqual(r.mode, "reel")
        self.assertEqual(r.confiance, 0.0)
        self.assertEqual(r.valeurs, {})
        self.assertEqual(session.get.call_args.kwargs["timeout"], 4.0)


# -- Sol (SoilGrids) --------------------------------------------------

def _soilgrids(ph10, clay, sand, silt):
    def couche(nom, mean):
        return {"name": nom, "depths": [{"label": "0-5cm", "values": {"mean": mean}}]}
    return {"properties": {"layers": [
        couche("phh2o", ph10), couche("clay", clay),
        couche("sand", sand), couche("silt", silt),
    ]}}


_SOILGRIDS_OK = _soilgrids(ph10=74, clay=380, sand=320, silt=300)


class AgentSolReelTests(AgentReelTestCase):
    def test_classe_texture(self):
        self.assertEqual(_classe_texture(40, 30, 30), "argileux")
        self.assertEqual(_classe_texture(10, 70, 20), "sableux")
        self.assertEqual(_classe_texture(15, 30, 55), "limoneux")
        self.assertEqual(_classe_texture(20, 40, 40), "franc")

    def test_cas_nominal_mock(self):
        session = Mock()
        session.get.return_value = _reponse_json(_SOILGRIDS_OK)
        agent = AgentSolReel(session=session)

        r = agent.collecter(31.63, -7.99)

        self.assertEqual(r.statut, "ok")
        self.assertEqual(r.mode, "reel")
        self.assertIn("SoilGrids", r.source)
        self.assertEqual(r.valeurs["ph_eau"], 7.4)         # phh2o 74 → pH ÷ 10
        self.assertEqual(r.valeurs["type_sol"], "argileux")  # 38 % argile
        self.assertEqual(r.valeurs["argile_pct"], 38.0)
        self.assertEqual(r.confiance, 0.70)

    def test_ph_aberrant_donne_indisponible(self):
        session = Mock()
        session.get.return_value = _reponse_json(_soilgrids(ph10=210, clay=200, sand=400, silt=400))
        agent = AgentSolReel(session=session)
        with self.assertLogs("agriscore.agents.sol_reel", "WARNING"):
            self.assertEqual(agent.collecter(31.63, -7.99).statut, "indisponible")

    def test_propriete_absente_donne_indisponible(self):
        payload = {"properties": {"layers": [
            {"name": "phh2o", "depths": [{"values": {"mean": 70}}]},
        ]}}  # clay/sand/silt manquants
        session = Mock()
        session.get.return_value = _reponse_json(payload)
        agent = AgentSolReel(session=session)
        with self.assertLogs("agriscore.agents.sol_reel", "WARNING"):
            self.assertEqual(agent.collecter(31.63, -7.99).statut, "indisponible")

    def test_echec_reseau_donne_indisponible(self):
        session = Mock()
        session.get.side_effect = requests.exceptions.ConnectionError("refused")
        agent = AgentSolReel(session=session)
        with self.assertLogs("agriscore.agents.sol_reel", "WARNING"):
            self.assertEqual(agent.collecter(31.63, -7.99).statut, "indisponible")


# -- Accès (OSRM) ---------------------------------------------------

_OSRM_OK = {"code": "Ok", "waypoints": [{"distance": 342.7, "name": "Route régionale 203"}]}


class AgentAccesReelTests(AgentReelTestCase):
    def test_extraire(self):
        self.assertEqual(_extraire_acces(_OSRM_OK), (342.7, "Route régionale 203"))
        for mauvais in ({"code": "NoSegment", "waypoints": []},
                        {"code": "Ok", "waypoints": []},
                        {"code": "Ok", "waypoints": [{"distance": None}]}):
            with self.subTest(mauvais=mauvais), self.assertRaises(ValueError):
                _extraire_acces(mauvais)

    def test_cas_nominal_mock(self):
        session = Mock()
        session.get.return_value = _reponse_json(_OSRM_OK)
        agent = AgentAccesReel(session=session)

        r = agent.collecter(31.63, -7.99)

        self.assertEqual(r.statut, "ok")
        self.assertEqual(r.mode, "reel")
        self.assertIn("OSRM", r.source)
        self.assertEqual(r.valeurs["distance_route_m"], 342.7)
        self.assertEqual(r.valeurs["route_nom"], "Route régionale 203")
        self.assertEqual(r.confiance, 0.75)

    def test_code_erreur_osrm_donne_indisponible(self):
        session = Mock()
        session.get.return_value = _reponse_json({"code": "NoSegment", "waypoints": []})
        agent = AgentAccesReel(session=session)
        with self.assertLogs("agriscore.agents.acces_reel", "WARNING"):
            self.assertEqual(agent.collecter(31.63, -7.99).statut, "indisponible")

    def test_echec_reseau_donne_indisponible(self):
        session = Mock()
        session.get.side_effect = requests.exceptions.Timeout("timed out")
        agent = AgentAccesReel(session=session)
        with self.assertLogs("agriscore.agents.acces_reel", "WARNING"):
            self.assertEqual(agent.collecter(31.63, -7.99).statut, "indisponible")


# -- NDVI (Sentinel-2 / CDSE Statistical API) ------------------------

def _mois_ndvi(mean, sample_count, nodata_count):
    return {"outputs": {"ndvi": {"bands": {"B0": {"stats": {
        "mean": mean, "sampleCount": sample_count, "noDataCount": nodata_count,
    }}}}}}


_MOIS_CLAIR = _mois_ndvi(0.70, 400, 20)      # ~95 % de pixels clairs
_MOIS_NUAGEUX = _mois_ndvi(0.25, 8, 500)     # ~1.5 % de pixels clairs → écarté


class AgentNdviReelPurTests(SimpleTestCase):
    def test_fenetre_12_mois(self):
        self.assertEqual(_fenetre_12_mois(date(2025, 3, 15)), (date(2024, 3, 1), date(2025, 2, 28)))
        self.assertEqual(_fenetre_12_mois(date(2025, 1, 10)), (date(2024, 1, 1), date(2024, 12, 31)))

    def test_agreger_serie_12_mois_clairs(self):
        ndvi, mois = _agreger_serie([_MOIS_CLAIR] * 12, 0.3)
        self.assertAlmostEqual(ndvi, 0.70, places=6)
        self.assertEqual(mois, 12)

    def test_agreger_serie_masque_les_mois_nuageux(self):
        serie = [_MOIS_CLAIR] * 5 + [_MOIS_NUAGEUX] * 7
        ndvi, mois = _agreger_serie(serie, 0.3)
        self.assertEqual(mois, 5)                 # 7 mois trop nuageux écartés
        self.assertAlmostEqual(ndvi, 0.70, places=6)

    def test_agreger_serie_ignore_mois_sans_acquisition(self):
        serie = [_MOIS_CLAIR] * 3 + [_mois_ndvi(0.0, 0, 0)] * 2 + [_mois_ndvi(None, 100, 0)]
        _ndvi, mois = _agreger_serie(serie, 0.3)
        self.assertEqual(mois, 3)

    def test_agreger_serie_borne_le_ndvi(self):
        ndvi, _mois = _agreger_serie([_mois_ndvi(5.0, 100, 0)], 0.3)
        self.assertEqual(ndvi, 1.0)

    def test_agreger_serie_aucun_mois_exploitable_leve(self):
        with self.assertRaises(ValueError):
            _agreger_serie([_MOIS_NUAGEUX] * 12, 0.3)


class AgentNdviReelTests(AgentReelTestCase):
    LAT, LON = 31.63, -7.99
    AUJ = date(2025, 3, 15)

    def test_cas_nominal_token_injecte(self):
        session = Mock()
        session.post.return_value = _reponse_json({"data": [_MOIS_CLAIR] * 12})
        agent = AgentNdviReel(token="TOK", session=session, aujourd_hui=self.AUJ)

        r = agent.collecter(self.LAT, self.LON)

        self.assertEqual(r.statut, "ok")
        self.assertEqual(r.mode, "reel")
        self.assertIn("Sentinel-2", r.source)
        self.assertAlmostEqual(r.valeurs["ndvi_moyen"], 0.70, places=3)
        self.assertEqual(r.valeurs["mois_exploitables"], 12)
        self.assertEqual(r.valeurs["mois_total"], 12)
        self.assertEqual(r.valeurs["fenetre"], "2024-03-01..2025-02-28")
        self.assertEqual(r.confiance, 0.9)                 # 12/12 mois nets
        self.assertEqual(session.post.call_args.kwargs["headers"]["Authorization"], "Bearer TOK")

    def test_confiance_baisse_avec_les_mois_nuageux(self):
        session = Mock()
        session.post.return_value = _reponse_json(
            {"data": [_MOIS_CLAIR] * 4 + [_MOIS_NUAGEUX] * 8}
        )
        agent = AgentNdviReel(token="TOK", session=session, aujourd_hui=self.AUJ)

        r = agent.collecter(self.LAT, self.LON)

        self.assertEqual(r.valeurs["mois_exploitables"], 4)
        self.assertEqual(r.confiance, round(0.9 * 4 / 12, 2))  # 0.3

    def test_oauth_puis_statistiques(self):
        session = Mock()
        session.post.side_effect = [
            _reponse_json({"access_token": "TOK_OAUTH"}),
            _reponse_json({"data": [_MOIS_CLAIR] * 12}),
        ]
        agent = AgentNdviReel(client_id="id", client_secret="secret",
                              session=session, aujourd_hui=self.AUJ)

        r = agent.collecter(self.LAT, self.LON)

        self.assertEqual(r.statut, "ok")
        self.assertEqual(session.post.call_count, 2)
        self.assertIn("token", session.post.call_args_list[0].args[0])
        self.assertEqual(
            session.post.call_args_list[1].kwargs["headers"]["Authorization"], "Bearer TOK_OAUTH"
        )

    def test_oauth_en_erreur_donne_indisponible(self):
        session = Mock()
        session.post.return_value = _reponse_json({}, ok=False)
        agent = AgentNdviReel(client_id="id", client_secret="secret",
                              session=session, aujourd_hui=self.AUJ)
        with self.assertLogs("agriscore.agents.ndvi_reel", "WARNING"):
            self.assertEqual(agent.collecter(self.LAT, self.LON).statut, "indisponible")

    @patch("agriscore.agents.ndvi_reel.reglage", return_value="")
    def test_sans_credentials_pas_d_appel_reseau(self, _reglage):
        # reglage() forcé à vide : indépendant d'un éventuel CDSE_CLIENT_ID
        # provisionné dans l'environnement de test.
        session = Mock()
        agent = AgentNdviReel(session=session, aujourd_hui=self.AUJ)
        with self.assertLogs("agriscore.agents.ndvi_reel", "WARNING"):
            r = agent.collecter(self.LAT, self.LON)
        self.assertEqual(r.statut, "indisponible")
        session.post.assert_not_called()

    def test_aucun_mois_exploitable_donne_indisponible(self):
        session = Mock()
        session.post.return_value = _reponse_json({"data": [_MOIS_NUAGEUX] * 12})
        agent = AgentNdviReel(token="TOK", session=session, aujourd_hui=self.AUJ)
        with self.assertLogs("agriscore.agents.ndvi_reel", "WARNING"):
            self.assertEqual(agent.collecter(self.LAT, self.LON).statut, "indisponible")

    def test_echec_reseau_donne_indisponible(self):
        session = Mock()
        session.post.side_effect = requests.exceptions.Timeout("timed out")
        agent = AgentNdviReel(token="TOK", session=session, aujourd_hui=self.AUJ)
        with self.assertLogs("agriscore.agents.ndvi_reel", "WARNING"):
            self.assertEqual(agent.collecter(self.LAT, self.LON).statut, "indisponible")


# -- Pipeline avec les 5 agents réels ------------------------------

def _agents_reels_mockes():
    sol = Mock(); sol.get.return_value = _reponse_json(_SOILGRIDS_OK)
    climat = Mock(); climat.get.return_value = _reponse_json(_OPENMETEO_OK)
    acces = Mock(); acces.get.return_value = _reponse_json(_OSRM_OK)
    topo = Mock(); topo.get.return_value = _reponse_ok(_aaigrid(_GRILLE_PLATE))
    ndvi = Mock(); ndvi.post.return_value = _reponse_json({"data": [_MOIS_CLAIR] * 12})
    return (
        AgentSolReel(session=sol),
        AgentClimatReel(session=climat),
        AgentNdviReel(token="TOK", session=ndvi, aujourd_hui=date(2025, 3, 15)),
        AgentTopoReel(api_key="CLE", session=topo),
        AgentAccesReel(session=acces),
    )


class PipelineToutReelTests(AgentReelTestCase):
    def test_passeport_tout_reel(self):
        passeport = generer_passeport(31.63, -7.99, agents=_agents_reels_mockes())

        self.assertEqual(passeport["mode"], "reel")
        self.assertEqual(passeport["avertissement"], "")  # plus aucune dimension simulée
        for dim, bloc in passeport["dimensions"].items():
            with self.subTest(dimension=dim):
                self.assertEqual(bloc["statut"], "ok")
                self.assertEqual(bloc["mode"], "reel")
                self.assertIsInstance(bloc["sous_score"], float)
        self.assertIsNotNone(passeport["score_global"])
        self.assertGreater(passeport["fiabilite_globale"], 0.0)
        self.assertEqual(len(passeport["cultures_suggerees"]), 4)
        json.dumps(passeport)

    def test_pipeline_survit_a_tous_les_agents_en_echec(self):
        def _ko():
            client = Mock()
            client.get.side_effect = requests.exceptions.Timeout("x")
            client.post.side_effect = requests.exceptions.Timeout("x")
            return client

        agents = (
            AgentSolReel(session=_ko()),
            AgentClimatReel(session=_ko()),
            AgentNdviReel(token="T", session=_ko()),
            AgentTopoReel(api_key="K", session=_ko()),
            AgentAccesReel(session=_ko()),
        )

        with self.assertLogs("agriscore.agents", "WARNING"):
            passeport = generer_passeport(31.63, -7.99, agents=agents)

        for bloc in passeport["dimensions"].values():
            self.assertEqual(bloc["statut"], "indisponible")
        self.assertIsNone(passeport["score_global"])
        self.assertEqual(passeport["fiabilite_globale"], 0.0)
        self.assertEqual(len(passeport["cultures_suggerees"]), 4)  # suggestions toujours produites
        self.assertEqual(
            set(passeport["dimensions_indisponibles"]),
            {"sol", "climat", "ndvi", "topo", "acces"},
        )
        self.assertIn("aucune dimension exploitable", passeport["avertissement"].lower())
        json.dumps(passeport)


# ══════════════════════════════════════════════════════════════════════
# Étape 7 — Cache, flag admin, endpoint
# ══════════════════════════════════════════════════════════════════════

from agriscore.agents._cache import cle_cache  # noqa: E402


class AgentCacheTests(AgentReelTestCase):
    def _topo(self, session):
        return AgentTopoReel(api_key="CLE", session=session)

    def test_seconde_collecte_servie_depuis_le_cache(self):
        session = Mock()
        session.get.return_value = _reponse_ok(_aaigrid(_GRILLE_PLATE))
        agent = self._topo(session)

        r1 = agent.collecter(31.63, -7.99)
        r2 = agent.collecter(31.63, -7.99)

        self.assertEqual(session.get.call_count, 1)          # 2ᵉ appel non retapé
        self.assertEqual(r2.statut, "ok")
        self.assertEqual(r1.date_collecte, r2.date_collecte)  # même AgentResult figé

    def test_coordonnees_differentes_retapent_l_api(self):
        session = Mock()
        session.get.return_value = _reponse_ok(_aaigrid(_GRILLE_PLATE))
        agent = self._topo(session)

        agent.collecter(31.63, -7.99)
        agent.collecter(34.02, -6.83)

        self.assertEqual(session.get.call_count, 2)

    def test_coordonnees_arrondies_partagent_l_entree(self):
        session = Mock()
        session.get.return_value = _reponse_ok(_aaigrid(_GRILLE_PLATE))
        agent = self._topo(session)

        agent.collecter(31.6301, -7.9899)
        agent.collecter(31.6304, -7.9902)   # < 100 m → même clé arrondie

        self.assertEqual(session.get.call_count, 1)

    def test_echec_jamais_mis_en_cache(self):
        session = Mock()
        session.get.side_effect = requests.exceptions.Timeout("x")
        agent = self._topo(session)

        with self.assertLogs("agriscore.agents.topo_reel", "WARNING"):
            r1 = agent.collecter(31.63, -7.99)

        session.get.side_effect = None
        session.get.return_value = _reponse_ok(_aaigrid(_GRILLE_PLATE))
        r2 = agent.collecter(31.63, -7.99)   # l'API revient → on retente

        self.assertEqual(r1.statut, "indisponible")
        self.assertEqual(r2.statut, "ok")
        self.assertEqual(session.get.call_count, 2)

    def test_agent_simule_ne_cache_pas(self):
        self.assertIsNone(AgentTopoSimule.cache_ttl_s)
        AgentTopoSimule().collecter(31.63, -7.99)
        self.assertIsNone(cache.get(cle_cache("topo", 31.63, -7.99)))

    def test_ttl_ndvi_plus_court_que_les_dimensions_stables(self):
        self.assertLess(AgentNdviReel.cache_ttl_s, AgentSolReel.cache_ttl_s)
        self.assertLess(AgentNdviReel.cache_ttl_s, AgentTopoReel.cache_ttl_s)
        self.assertLess(AgentNdviReel.cache_ttl_s, AgentTopoOpenMeteo.cache_ttl_s)
        self.assertLess(AgentNdviReel.cache_ttl_s, AgentClimatReel.cache_ttl_s)
        self.assertLessEqual(AgentAccesReel.cache_ttl_s, AgentSolReel.cache_ttl_s)
        # Les deux agents topo partagent le même TTL (relief invariant).
        self.assertEqual(AgentTopoOpenMeteo.cache_ttl_s, AgentTopoReel.cache_ttl_s)

    def test_cle_cache_forme(self):
        self.assertEqual(cle_cache("sol", 31.6349, -7.9851), "agriscore:agent:sol:31.635:-7.985")


class ConfigurationAgriScoreTests(TestCase):
    def test_singleton_une_seule_ligne(self):
        c1 = ConfigurationAgriScore.charger()
        ConfigurationAgriScore.charger()
        self.assertEqual(ConfigurationAgriScore.objects.count(), 1)

        c1.actif = False
        c1.save()
        self.assertEqual(ConfigurationAgriScore.objects.count(), 1)  # pk forcé à 1
        self.assertEqual(c1.pk, 1)

    def test_pipeline_actif_vrai_par_defaut(self):
        self.assertTrue(ConfigurationAgriScore.pipeline_actif())

    def test_pipeline_actif_suit_le_flag(self):
        ConfigurationAgriScore.objects.update_or_create(pk=1, defaults={"actif": False})
        self.assertFalse(ConfigurationAgriScore.pipeline_actif())
        ConfigurationAgriScore.objects.update_or_create(pk=1, defaults={"actif": True})
        self.assertTrue(ConfigurationAgriScore.pipeline_actif())

    # ── Pondérations configurables (2026-09-11) ──────────────────────────

    def test_poids_nominaux_par_defaut(self):
        # Ligne singleton jamais éditée → les défauts des champs, identiques
        # aux poids nominaux d'origine (aucun changement de comportement au
        # déploiement de la migration qui les ajoute).
        self.assertEqual(ConfigurationAgriScore.poids_nominaux(), dict(POIDS_NOMINAUX))

    def test_poids_nominaux_suit_la_config(self):
        ConfigurationAgriScore.objects.update_or_create(
            pk=1,
            defaults={"poids_ndvi": 10, "poids_climat": 10, "poids_sol": 10, "poids_topo": 10, "poids_acces": 60},
        )
        self.assertEqual(
            ConfigurationAgriScore.poids_nominaux(),
            {"ndvi": 10, "climat": 10, "sol": 10, "topo": 10, "acces": 60},
        )

    @patch.object(ConfigurationAgriScore, "charger", side_effect=DatabaseError)
    def test_poids_nominaux_repli_si_db_ko(self, _charger_mock):
        # Même philosophie que pipeline_actif() : base injoignable ⇒ poids
        # nominaux d'origine, jamais un 500 sur le passeport.
        self.assertEqual(ConfigurationAgriScore.poids_nominaux(), dict(POIDS_NOMINAUX))

    def test_clean_rejette_somme_differente_de_100(self):
        c = ConfigurationAgriScore(poids_ndvi=30, poids_climat=20, poids_sol=20, poids_topo=20, poids_acces=15)
        with self.assertRaises(ValidationError):
            c.full_clean()

    def test_clean_accepte_somme_100_repartition_differente(self):
        # Répartition volontairement différente du défaut (25/20/20/20/15) —
        # seule la somme est contrainte, pas la répartition elle-même.
        c = ConfigurationAgriScore(poids_ndvi=40, poids_climat=15, poids_sol=15, poids_topo=15, poids_acces=15)
        c.full_clean()  # ne lève pas


class PasseportSelectionAgentsTests(TestCase):
    @patch("agriscore.passeport.generer_passeport")
    def test_flag_actif_selectionne_les_agents_reels(self, faux_generer):
        from agriscore.passeport import passeport_parcelle

        ConfigurationAgriScore.objects.update_or_create(pk=1, defaults={"actif": True})
        passeport_parcelle(31.63, -7.99)

        self.assertIs(faux_generer.call_args.kwargs["agents"], AGENTS_DEFAUT)

    @patch("agriscore.passeport.generer_passeport")
    def test_flag_inactif_selectionne_les_agents_simules(self, faux_generer):
        from agriscore.passeport import passeport_parcelle

        ConfigurationAgriScore.objects.update_or_create(pk=1, defaults={"actif": False})
        passeport_parcelle(31.63, -7.99)

        self.assertIs(faux_generer.call_args.kwargs["agents"], AGENTS_SIMULES)

    @patch("agriscore.passeport.generer_passeport")
    def test_transmet_les_poids_de_la_config(self, faux_generer):
        from agriscore.passeport import passeport_parcelle

        ConfigurationAgriScore.objects.update_or_create(
            pk=1,
            defaults={"poids_ndvi": 10, "poids_climat": 10, "poids_sol": 10, "poids_topo": 10, "poids_acces": 60},
        )
        passeport_parcelle(31.63, -7.99)

        self.assertEqual(
            faux_generer.call_args.kwargs["poids_nominaux"],
            {"ndvi": 10, "climat": 10, "sol": 10, "topo": 10, "acces": 60},
        )


@override_settings(CACHES=_CACHE_LOCMEM)
class PasseportParcelleAPITests(APITestCase):
    def setUp(self):
        from annonces.models import Parcelle

        cache.clear()
        self.addCleanup(cache.clear)
        self.parcelle = Parcelle.objects.create(
            surface_ha=2.5, latitude=31.63, longitude=-7.99,
        )

    def _url(self, pk):
        return f"/api/parcelles/{pk}/passeport/"

    def test_flag_inactif_renvoie_passeport_simule(self):
        ConfigurationAgriScore.objects.update_or_create(pk=1, defaults={"actif": False})

        reponse = self.client.get(self._url(self.parcelle.id))

        self.assertEqual(reponse.status_code, 200)
        corps = reponse.json()
        self.assertEqual(corps["mode"], "simule")
        self.assertEqual(corps["parcelle_id"], str(self.parcelle.id))
        self.assertEqual(
            set(corps["dimensions"]), {"sol", "climat", "ndvi", "topo", "acces"}
        )
        for bloc in corps["dimensions"].values():
            self.assertEqual(bloc["statut"], "ok")
            self.assertEqual(bloc["mode"], "simule")
        self.assertEqual(len(corps["cultures_suggerees"]), 4)
        json.dumps(corps)

    def test_reponse_ne_divulgue_pas_les_coordonnees(self):
        # Endpoint public : renvoyer lat/lon contournerait le floutage de
        # localisation d'une annonce confidentielle (le vrai UUID de parcelle
        # est déjà exposé par /api/annonces/<slug>/).
        ConfigurationAgriScore.objects.update_or_create(pk=1, defaults={"actif": False})

        corps = self.client.get(self._url(self.parcelle.id)).json()

        self.assertNotIn("coordonnees", corps)
        self.assertNotIn("latitude", json.dumps(corps))
        self.assertNotIn("longitude", json.dumps(corps))

    @patch("agriscore.api_views.passeport_parcelle")
    def test_flag_actif_appelle_le_pipeline_avec_les_coordonnees(self, faux_passeport):
        faux_passeport.return_value = {
            "mode": "reel", "score_global": 80.0,
            "dimensions": {}, "cultures_suggerees": [],
        }
        ConfigurationAgriScore.objects.update_or_create(pk=1, defaults={"actif": True})

        reponse = self.client.get(self._url(self.parcelle.id))

        self.assertEqual(reponse.status_code, 200)
        faux_passeport.assert_called_once_with(31.63, -7.99)
        self.assertEqual(reponse.json()["parcelle_id"], str(self.parcelle.id))

    def test_parcelle_inexistante_404(self):
        import uuid

        reponse = self.client.get(self._url(uuid.uuid4()))
        self.assertEqual(reponse.status_code, 404)

    def test_parcelle_non_geolocalisee_422(self):
        from annonces.models import Parcelle

        nue = Parcelle.objects.create(surface_ha=1.0)
        reponse = self.client.get(self._url(nue.id))
        self.assertEqual(reponse.status_code, 422)

    @patch("agriscore.api_views.passeport_parcelle")
    def test_annonce_confidentielle_floute_les_coordonnees_du_pipeline(self, faux_passeport):
        # Une annonce loc_confidentielle sur cette parcelle : le pipeline
        # (endpoint public, anonyme) ne doit JAMAIS recevoir les coordonnées
        # exactes — sinon comparer des passeports permettrait de retrouver le
        # point réel, contournant le floutage de la fiche.
        from django.contrib.auth import get_user_model
        from annonces.models import Annonce
        from annonces.serializers import _flouter_position

        faux_passeport.return_value = {
            "mode": "reel", "score_global": 80.0,
            "dimensions": {}, "cultures_suggerees": [],
        }
        ConfigurationAgriScore.objects.update_or_create(pk=1, defaults={"actif": True})
        proprio = get_user_model().objects.create_user(
            email="vendeur.conf@akal.ma", password="x", nom="N", prenom="P",
        )
        Annonce.objects.create(
            parcelle=self.parcelle, proprietaire=proprio, titre="Confidentiel",
            description="d", prix_mad=100000, statut="brouillon",
            loc_confidentielle=True,
        )

        self.client.get(self._url(self.parcelle.id))

        lat_floue, lon_floue = _flouter_position(31.63, -7.99, self.parcelle.id)
        faux_passeport.assert_called_once_with(lat_floue, lon_floue)
        self.assertNotEqual((lat_floue, lon_floue), (31.63, -7.99))

    @patch("agriscore.api_views.passeport_parcelle")
    def test_annonce_non_confidentielle_garde_les_coordonnees_exactes(self, faux_passeport):
        from django.contrib.auth import get_user_model
        from annonces.models import Annonce

        faux_passeport.return_value = {
            "mode": "reel", "score_global": 80.0,
            "dimensions": {}, "cultures_suggerees": [],
        }
        ConfigurationAgriScore.objects.update_or_create(pk=1, defaults={"actif": True})
        proprio = get_user_model().objects.create_user(
            email="vendeur.pub@akal.ma", password="x", nom="N", prenom="P",
        )
        Annonce.objects.create(
            parcelle=self.parcelle, proprietaire=proprio, titre="Public",
            description="d", prix_mad=100000, statut="brouillon",
            loc_confidentielle=False,
        )

        self.client.get(self._url(self.parcelle.id))

        faux_passeport.assert_called_once_with(31.63, -7.99)

    # ── Rate limiting : cache du passeport assemblé + verrou de calcul ────

    @patch("agriscore.api_views.passeport_parcelle")
    def test_second_appel_servi_depuis_le_cache_sans_relancer_le_pipeline(self, faux_passeport):
        faux_passeport.return_value = {
            "mode": "reel", "score_global": 80.0,
            "dimensions": {}, "cultures_suggerees": [],
        }
        ConfigurationAgriScore.objects.update_or_create(pk=1, defaults={"actif": True})

        r1 = self.client.get(self._url(self.parcelle.id))
        r2 = self.client.get(self._url(self.parcelle.id))
        r3 = self.client.get(self._url(self.parcelle.id))

        self.assertEqual([r1.status_code, r2.status_code, r3.status_code], [200, 200, 200])
        self.assertEqual(r1.json(), r2.json())
        # Le pipeline (et donc les appels externes) n'a tourné qu'UNE fois
        # pour les trois requêtes.
        faux_passeport.assert_called_once()

    def test_calcul_concurrent_pour_la_meme_parcelle_renvoie_429(self):
        # Simule un calcul déjà en cours : le verrou est posé, rien en cache.
        ConfigurationAgriScore.objects.update_or_create(pk=1, defaults={"actif": False})
        cache.add(f"agriscore:passeport:calcul:{self.parcelle.id}", True, 60)

        reponse = self.client.get(self._url(self.parcelle.id))

        self.assertEqual(reponse.status_code, 429)
        self.assertIn("cours", reponse.json()["detail"].lower())
        self.assertIn("Retry-After", reponse.headers)

    @patch("agriscore.api_views.passeport_parcelle")
    def test_verrou_libere_apres_le_calcul(self, faux_passeport):
        faux_passeport.return_value = {
            "mode": "reel", "score_global": 80.0,
            "dimensions": {}, "cultures_suggerees": [],
        }
        ConfigurationAgriScore.objects.update_or_create(pk=1, defaults={"actif": True})

        self.client.get(self._url(self.parcelle.id))

        # Verrou levé (finally) — pas de 503 fantôme au prochain passage.
        self.assertIsNone(cache.get(f"agriscore:passeport:calcul:{self.parcelle.id}"))
