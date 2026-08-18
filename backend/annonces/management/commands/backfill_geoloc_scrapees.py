"""
Management command : backfill_geoloc_scrapees

Rattrapage ponctuel (décision produit du 2026-08-18, cf. docstring de
import_scraped_data et docs/plans) pour les annonces scrapées (Avito/
Mubawab) déjà importées AVANT l'introduction du repli RÉGION dans
import_scraped_data — celui-ci ne s'applique qu'aux nouvelles entrées d'un
import (`_importer_entree`), jamais rejoué sur une annonce déjà en base
(`deja_importees`, idempotence par (source, source_id)). Cette commande
comble cet écart en ré-appliquant la même logique de résolution (commune
précise, puis région approximative) directement sur le titre/la description
déjà stockés en base — pas besoin de retrouver le JSON scrapé d'origine.

Ne touche QUE les annonces dont la parcelle n'a aucune coordonnée
(`latitude` NULL) — jamais une géolocalisation déjà renseignée, précise ou
approximative. Réutilise mot pour mot les fonctions de résolution de
import_scraped_data (aucune logique dupliquée) : mêmes règles, mêmes
garanties (is_geolocated()/can_publish() inchangés pour le repli région, cf.
docstring du module import_scraped_data).

Usage:
    python manage.py backfill_geoloc_scrapees --dry-run   # aperçu, aucune écriture
    python manage.py backfill_geoloc_scrapees              # applique
    python manage.py backfill_geoloc_scrapees --source avito
"""

from django.conf import settings
from django.contrib.gis.db.models import Union as UnionGeom
from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from annonces.management.commands.import_scraped_data import (
    _chercher_lieu_dans_texte,
    _index_pour_recherche_texte,
    _normaliser,
    _normaliser_pour_recherche,
    _ville_brute_depuis_url_avito,
)
from annonces.models import Annonce
from geo.models import CommuneGeom, ProvinceGeom, RegionOfficielle


class Command(BaseCommand):
    help = (
        "Rattrape la géolocalisation (commune précise ou région "
        "approximative) des annonces scrapées déjà importées mais jamais "
        "géolocalisées — cf. import_scraped_data pour la logique."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--source', choices=['avito', 'mubawab', 'all'], default='all',
            help="Source à traiter (défaut: all).",
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help="N'écrit rien — affiche seulement ce qui serait fait.",
        )
        parser.add_argument(
            '--force', action='store_true',
            help="Requis pour lancer cette commande sous akal.settings.prod (même garde-fou qu'import_scraped_data).",
        )

    def handle(self, *args, **options):
        if settings.SETTINGS_MODULE == 'akal.settings.prod' and not options['force']:
            raise CommandError(
                "Cette commande ne concerne que les annonces scrapées de test — jamais destinée à la "
                "production. Relancez avec --force si c'est réellement intentionnel."
            )

        communes = list(CommuneGeom.objects.all())
        communes_normalisees = {_normaliser(c.nom_affichage): c for c in communes}
        communes_tries = _index_pour_recherche_texte(communes, 'nom_affichage')

        regions = list(RegionOfficielle.objects.all())
        regions_tries = _index_pour_recherche_texte(regions, 'nom')
        region_centroides = {}
        for region in regions:
            union = ProvinceGeom.objects.filter(region=region).aggregate(u=UnionGeom('geom'))['u']
            if union is not None:
                region_centroides[region.pk] = union.centroid

        sources = ['avito', 'mubawab'] if options['source'] == 'all' else [options['source']]
        qs = (
            Annonce.objects
            .filter(source__in=sources, parcelle__latitude__isnull=True)
            .select_related('parcelle')
            .order_by('id')
        )

        total = qs.count()
        maj_commune = maj_region = inchangees = 0
        self.stdout.write(f"{total} annonce(s) sans coordonnée à examiner ({'/'.join(sources)}).\n")

        for annonce in qs:
            ville_brute = (
                _ville_brute_depuis_url_avito(annonce.source_url or '')
                if annonce.source == 'avito' else None
            )
            commune_geom = communes_normalisees.get(_normaliser(ville_brute)) if ville_brute else None

            texte_recherche = _normaliser_pour_recherche(
                f"{annonce.titre} {annonce.description} {ville_brute or ''}"
            )
            if commune_geom is None:
                commune_geom = _chercher_lieu_dans_texte(texte_recherche, communes_tries)

            region_approx = None
            if commune_geom is None:
                region_approx = _chercher_lieu_dans_texte(texte_recherche, regions_tries)

            parcelle = annonce.parcelle
            if commune_geom is not None:
                centroide = commune_geom.geom.centroid
                precision = 'commune'
            elif region_approx is not None and region_approx.pk in region_centroides:
                centroide = region_centroides[region_approx.pk]
                precision = 'region'
            else:
                inchangees += 1
                continue

            self.stdout.write(
                f"  [{precision:8s}] {annonce.titre[:60]:60s} -> "
                f"{(commune_geom.nom_affichage if commune_geom else region_approx.nom)}"
            )
            if options['dry_run']:
                if precision == 'commune':
                    maj_commune += 1
                else:
                    maj_region += 1
                continue

            with transaction.atomic():
                parcelle.latitude, parcelle.longitude = centroide.y, centroide.x
                parcelle.geom = Point(centroide.x, centroide.y, srid=4326)
                # `commune_geom` : uniquement pour une résolution COMMUNE —
                # jamais pour un repli RÉGION (cf. docstring module
                # import_scraped_data : is_geolocated()/can_publish() ne
                # doivent pas changer de statut pour une position seulement
                # approximative).
                if precision == 'commune':
                    parcelle.commune_geom = commune_geom
                parcelle.metadata = {**(parcelle.metadata or {}), 'geoloc_precision': precision}
                parcelle.save(update_fields=['latitude', 'longitude', 'geom', 'commune_geom', 'metadata'])

            if precision == 'commune':
                maj_commune += 1
            else:
                maj_region += 1

        self.stdout.write(self.style.MIGRATE_HEADING('\n== Bilan ==\n'))
        self.stdout.write(
            f"géolocalisées (commune): {maj_commune} | "
            f"géolocalisées (région, approximatif): {maj_region} | "
            f"toujours sans coordonnée: {inchangees}"
        )
        if options['dry_run']:
            self.stdout.write(self.style.WARNING("--dry-run : aucune écriture effectuée."))
