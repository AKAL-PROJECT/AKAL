"""
Modèles de l'app ``agriscore``.

Uniquement la configuration du pipeline. Le pipeline lui-même
(agents, scoring, agrégation, interprétation, orchestrateur) reste des
modules Python purs, sans ORM.
"""

from __future__ import annotations

import logging

from django.db import DatabaseError, models

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
    modifie_le = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'agriscore_configuration'
        verbose_name = 'configuration AgriScore'
        verbose_name_plural = 'configuration AgriScore'

    def __str__(self) -> str:
        return f"AgriScore — {'actif (API réelles)' if self.actif else 'désactivé (simulé)'}"

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
