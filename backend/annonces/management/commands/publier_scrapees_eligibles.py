"""
Management command : publier_scrapees_eligibles

Suite de backfill_geoloc_scrapees (décision produit du 2026-08-18) : une
annonce scrapée peut satisfaire Annonce.can_publish() (géolocalisation +
photo + prix) sans jamais avoir été publiée — notamment les 56 annonces
devenues éligibles après le rattrapage de géolocalisation (résolution
COMMUNE précise, cf. import_scraped_data), toujours en brouillon puisque
`_importer_entree` n'applique can_publish() qu'au moment de l'import, jamais
rejoué ensuite. Sans cette étape, une annonce peut satisfaire tous les
prérequis de publication et rester invisible du catalogue public/de la
carte (AnnonceListCreateAPIView.get_queryset() ne retourne que `en_ligne`).

Ne publie QUE ce qui satisfait réellement can_publish() au moment de
l'exécution — même garde-fou que import_scraped_data, jamais un statut forcé
en dehors de ce que la règle métier autorise. N'importe quel statut de
départ valide pour la transition (brouillon/en_attente → en_ligne, cf.
transitions.py) est accepté, pas seulement brouillon.

Usage:
    python manage.py publier_scrapees_eligibles --dry-run
    python manage.py publier_scrapees_eligibles
    python manage.py publier_scrapees_eligibles --source avito
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from annonces.models import Annonce
from annonces.transitions import transition_autorisee


class Command(BaseCommand):
    help = (
        "Publie (brouillon/en_attente -> en_ligne) les annonces scrapées "
        "qui satisfont déjà can_publish() mais n'ont jamais été publiées."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--source', choices=['avito', 'mubawab', 'all'], default='all',
            help="Source à traiter (défaut: all).",
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help="N'écrit rien — affiche seulement ce qui serait publié.",
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

        sources = ['avito', 'mubawab'] if options['source'] == 'all' else [options['source']]
        qs = (
            Annonce.objects
            .filter(source__in=sources, statut__in=[
                Annonce.StatutAnnonce.BROUILLON, Annonce.StatutAnnonce.EN_ATTENTE,
            ])
            .select_related('parcelle')
            .order_by('id')
        )

        publiees = 0
        for annonce in qs:
            peut_publier, _raisons = annonce.can_publish()
            if not peut_publier or not transition_autorisee(annonce.statut, Annonce.StatutAnnonce.EN_LIGNE):
                continue

            self.stdout.write(f"  {annonce.titre[:70]:70s} ({annonce.source})")
            publiees += 1
            if options['dry_run']:
                continue

            with transaction.atomic():
                annonce.statut = Annonce.StatutAnnonce.EN_LIGNE
                annonce.date_publication = timezone.now()
                annonce.save(update_fields=['statut', 'date_publication'])

        self.stdout.write(self.style.MIGRATE_HEADING('\n== Bilan ==\n'))
        self.stdout.write(f"publiées: {publiees}")
        if options['dry_run']:
            self.stdout.write(self.style.WARNING("--dry-run : aucune écriture effectuée."))
