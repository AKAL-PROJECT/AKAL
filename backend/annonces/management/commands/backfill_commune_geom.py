"""
Management command : backfill_commune_geom

Renseigne ``Parcelle.commune_geom`` (référentiel géométrique officiel) pour
les parcelles DÉJÀ géolocalisées (``latitude``/``longitude`` non nulles) qui
ne portent que l'ancien ``commune`` legacy — ou aucune commune.

Pourquoi c'est nécessaire
-------------------------
Le filtre catalogue province/commune (P0-04, ``AnnonceAPIFilter``),
``Parcelle.is_geolocated()`` et ``Annonce.can_publish()`` se réfèrent tous à
``commune_geom``, jamais au ``commune`` legacy. Or ``seed_demo`` et
``seed_test_data`` n'écrivent que ``commune`` legacy → sur le catalogue de
démo, ``?province=`` / ``?commune=`` renvoyaient 0 résultat et une annonce du
seed ne pouvait pas se republier après édition.

Méthode
-------
Jointure spatiale pure : la ``CommuneGeom`` dont le polygone CONTIENT le
point ``(longitude, latitude)`` de la parcelle. Aucune donnée inventée — si
aucun polygone ne contient le point (coordonnée hors Maroc, ou référentiel
non importé), la parcelle est laissée telle quelle.

Usage
-----
    python manage.py backfill_commune_geom --dry-run   # aperçu, aucune écriture
    python manage.py backfill_commune_geom              # applique
    python manage.py backfill_commune_geom --force      # requis sous akal.settings.prod
"""

from django.conf import settings
from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from annonces.models import Parcelle
from geo.models import CommuneGeom


class Command(BaseCommand):
    help = (
        "Renseigne Parcelle.commune_geom par jointure spatiale pour les "
        "parcelles géolocalisées qui ne l'ont pas (données seed / legacy)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help="N'écrit rien — affiche seulement ce qui serait fait.",
        )
        parser.add_argument(
            '--force', action='store_true',
            help="Requis sous akal.settings.prod (modifie des Parcelle en place).",
        )

    def handle(self, *args, **options):
        if getattr(settings, 'SETTINGS_MODULE', '') == 'akal.settings.prod' and not options['force']:
            raise CommandError(
                "Sous prod, relancez avec --force si c'est réellement intentionnel."
            )

        if not CommuneGeom.objects.exists():
            raise CommandError(
                "Référentiel CommuneGeom vide — lancez d'abord "
                "`manage.py import_geo_officiel`."
            )

        qs = (
            Parcelle.objects
            .filter(latitude__isnull=False, longitude__isnull=False, commune_geom__isnull=True)
            .order_by('created_at')
        )
        total = qs.count()
        self.stdout.write(f"{total} parcelle(s) géolocalisée(s) sans commune_geom.\n")

        rattachees = hors_polygone = 0
        for parcelle in qs.iterator():
            point = Point(parcelle.longitude, parcelle.latitude, srid=4326)
            commune = (
                CommuneGeom.objects
                .filter(geom__contains=point)
                .select_related('province')
                .first()
            )
            if commune is None:
                hors_polygone += 1
                continue

            self.stdout.write(
                f"  {str(parcelle.id)[:8]}  ({parcelle.latitude:.4f}, {parcelle.longitude:.4f})"
                f"  ->  {commune.nom_affichage} / {commune.province.nom}"
            )
            if not options['dry_run']:
                with transaction.atomic():
                    parcelle.commune_geom = commune
                    parcelle.save(update_fields=['commune_geom'])
            rattachees += 1

        self.stdout.write(self.style.MIGRATE_HEADING('\n== Bilan ==\n'))
        self.stdout.write(
            f"rattachées: {rattachees} | hors de tout polygone commune: {hors_polygone}"
        )
        if options['dry_run']:
            self.stdout.write(self.style.WARNING("--dry-run : aucune écriture effectuée."))
