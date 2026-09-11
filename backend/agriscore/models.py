"""
Modèles de l'app ``agriscore``.

Uniquement la configuration du pipeline. Le pipeline lui-même
(agents, scoring, agrégation, interprétation, orchestrateur) reste des
modules Python purs, sans ORM.
"""

from __future__ import annotations

import logging

from django.core.exceptions import ValidationError
from django.db import DatabaseError, models
from django.db.models import F
from django.utils import timezone

from agriscore.aggregation import POIDS_NOMINAUX

logger = logging.getLogger(__name__)


class ConfigurationAgriScore(models.Model):
    """Réglages du pipeline AgriScore — **ligne unique**, éditable via l'admin.

    Même principe qu'un interrupteur de modération : ``actif`` décoché coupe
    l'accès aux vraies API (le passeport bascule en mode simulé) sans
    redéploiement — utile en incident fournisseur ou pour une démo.
    """

    actif = models.BooleanField(
        default=True,
        verbose_name='pipeline actif (API réelles)',
        help_text=(
            "Coché : le passeport interroge les vraies sources (Copernicus, "
            "Open-Meteo, SoilGrids, OSRM). Décoché : passeport simulé, aucune "
            "API externe appelée."
        ),
    )

    # Pondérations des 5 dimensions du score (2026-09-11) — ajustables sans
    # redéploiement, contrairement aux poids nominaux d'origine, codés en dur
    # dans agriscore.aggregation.POIDS_NOMINAUX (repris ici comme défauts :
    # une migration qui ajoute ces champs à une ligne singleton déjà en base
    # ne change donc PAS le comportement de scoring au déploiement). La
    # validation "somme = 100" vit dans clean() ci-dessous, pas ici : elle a
    # besoin des 5 valeurs à la fois, qu'un seul champ ne peut pas voir.
    poids_ndvi = models.PositiveSmallIntegerField(
        default=POIDS_NOMINAUX['ndvi'], verbose_name='poids NDVI (%)',
    )
    poids_climat = models.PositiveSmallIntegerField(
        default=POIDS_NOMINAUX['climat'], verbose_name='poids climat (%)',
    )
    poids_sol = models.PositiveSmallIntegerField(
        default=POIDS_NOMINAUX['sol'], verbose_name='poids sol (%)',
    )
    poids_topo = models.PositiveSmallIntegerField(
        default=POIDS_NOMINAUX['topo'], verbose_name='poids topographie (%)',
    )
    poids_acces = models.PositiveSmallIntegerField(
        default=POIDS_NOMINAUX['acces'], verbose_name='poids accès (%)',
    )

    modifie_le = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'agriscore_configuration'
        verbose_name = 'configuration AgriScore'
        verbose_name_plural = 'configuration AgriScore'

    def __str__(self) -> str:
        return f"AgriScore — {'actif (API réelles)' if self.actif else 'désactivé (simulé)'}"

    def clean(self):
        super().clean()
        total = self.poids_ndvi + self.poids_climat + self.poids_sol + self.poids_topo + self.poids_acces
        if total != 100:
            raise ValidationError(
                f"La somme des pondérations doit faire 100 (actuellement {total})."
            )

    def save(self, *args, **kwargs):
        self.pk = 1  # singleton : jamais qu'une ligne
        super().save(*args, **kwargs)

    @classmethod
    def charger(cls) -> 'ConfigurationAgriScore':
        """L'unique instance, créée avec les valeurs par défaut si besoin."""
        objet, _ = cls.objects.get_or_create(pk=1)
        return objet

    @classmethod
    def pipeline_actif(cls) -> bool:
        """``actif``, avec repli sûr : table absente ou base KO ⇒ pipeline supposé actif."""
        try:
            return cls.charger().actif
        except DatabaseError:
            logger.warning(
                "ConfigurationAgriScore illisible — pipeline supposé actif", exc_info=True
            )
            return True

    @classmethod
    def poids_nominaux(cls) -> dict[str, int]:
        """Poids des 5 dimensions, avec repli sûr : table absente ou base KO
        ⇒ les poids nominaux d'origine (agriscore.aggregation.POIDS_NOMINAUX),
        jamais un 500 sur le passeport. Même patron que pipeline_actif()."""
        try:
            c = cls.charger()
            return {
                'ndvi': c.poids_ndvi,
                'climat': c.poids_climat,
                'sol': c.poids_sol,
                'topo': c.poids_topo,
                'acces': c.poids_acces,
            }
        except DatabaseError:
            logger.warning(
                "ConfigurationAgriScore illisible — poids nominaux par défaut", exc_info=True
            )
            return dict(POIDS_NOMINAUX)


class StatistiquePasseport(models.Model):
    """Compteur journalier GLOBAL de consultations du Passeport Agronomique
    (2026-09-11, tableau de bord de pilotage — akal.pilotage).

    Une ligne par jour, jamais par parcelle : contrairement à
    ``annonces.StatistiqueAnnonce`` (vues par annonce ET par jour), le
    pilotage n'a besoin que d'un total d'usage du produit, pas d'une
    ventilation par parcelle — inutile de complexifier le modèle pour une
    dimension qu'aucun écran n'exploite.

    Incrémenté à chaque réponse 200 de ``PasseportParcelleAPIView``, cache
    HIT ou calcul frais confondus : mesure l'usage réel (combien de fois un
    passeport a été consulté), pas le taux de cache du pipeline.
    """

    date = models.DateField(primary_key=True)
    compteur = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'agriscore_statistique_passeport'
        verbose_name = 'statistique passeport (consultations)'
        verbose_name_plural = 'statistiques passeport (consultations)'

    def __str__(self) -> str:
        return f"{self.date} — {self.compteur} consultation(s)"

    @classmethod
    def enregistrer_consultation(cls) -> None:
        """Incrémente atomiquement le compteur du jour. Fail-open, même
        philosophie que le cache/verrou du passeport (agriscore/api_views.py) :
        une consultation non comptée n'est jamais une raison de faire échouer
        la réponse au visiteur."""
        try:
            aujourdhui = timezone.localdate()
            cls.objects.get_or_create(date=aujourdhui)
            cls.objects.filter(date=aujourdhui).update(compteur=F('compteur') + 1)
        except DatabaseError:
            logger.warning(
                "StatistiquePasseport illisible — consultation non comptée", exc_info=True
            )
