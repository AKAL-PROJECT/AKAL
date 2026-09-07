"""
Management command : nettoyer_base_demo

Ramène la base à un état « démo propre » : le jeu de démonstration interne
(seed_demo) + le référentiel géo + les comptes essentiels, sans les résidus
de développement — annonces de test, parcelles orphelines, comptes UAT,
anciennes lignes AgriScore du modèle legacy.

╔══════════════════════════════════════════════════════════════════════════╗
║  NE TOUCHE JAMAIS aux données scrapées (source = avito / mubawab).       ║
║  Ni les annonces, ni leurs parcelles, ni leurs photos, ni les comptes    ║
║  scraper.*. Elles restent intégralement en base — seulement masquées du  ║
║  catalogue public par settings.AKAL_DATASET='simulated'.                 ║
╚══════════════════════════════════════════════════════════════════════════╝

Séquence typique avant une démo / soutenance :

    python manage.py seed_demo --clear
    python manage.py nettoyer_base_demo --dry-run     # aperçu, aucune écriture
    python manage.py nettoyer_base_demo
    python manage.py seed_demo                        # recrée ~15 annonces propres

Usage :
    python manage.py nettoyer_base_demo --dry-run
    python manage.py nettoyer_base_demo
    python manage.py nettoyer_base_demo --force       # requis sous akal.settings.prod
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Count

from accounts.models import User
from annonces.models import AgriScore, Annonce, Parcelle

# Comptes du jeu de démonstration (cf. seed_demo.SEED_USERS) + comptes système
# à ne jamais supprimer.
EMAILS_DEMO = {
    'demo.vendeur1@akal.ma',
    'demo.vendeur2@akal.ma',
    'demo.vendeur3@akal.ma',
}
EMAILS_SCRAPER = {
    'scraper.avito@akal.ma',
    'scraper.mubawab@akal.ma',
}
SOURCES_SCRAPEES = ['avito', 'mubawab']


class Command(BaseCommand):
    help = (
        "Nettoie les résidus de dev (annonces de test, parcelles orphelines, "
        "comptes UAT, AgriScore legacy). Ne touche JAMAIS aux données scrapées."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help="N'écrit rien — affiche seulement ce qui serait supprimé.",
        )
        parser.add_argument(
            '--force', action='store_true',
            help="Requis sous akal.settings.prod.",
        )

    def handle(self, *args, **options):
        if getattr(settings, 'SETTINGS_MODULE', '') == 'akal.settings.prod' and not options['force']:
            raise CommandError(
                "Sous prod, relancez avec --force si c'est réellement intentionnel."
            )

        dry = options['dry_run']
        self.stdout.write(self.style.MIGRATE_HEADING(
            '\n== Nettoyage base démo ==  (les données scrapées avito/mubawab sont préservées)\n'
        ))

        # Sécurité : on capture l'état scrapé AVANT et on revérifie APRÈS.
        scr_annonces_avant = Annonce.objects.filter(source__in=SOURCES_SCRAPEES).count()
        scr_photos_avant = _photos_scrapees()

        with transaction.atomic():
            n_annonces = self._supprimer_annonces_de_test(dry)
            n_parcelles = self._supprimer_parcelles_orphelines(dry)
            n_agriscore = self._supprimer_agriscore_legacy(dry)
            n_users = self._supprimer_comptes_de_test(dry)

            if dry:
                transaction.set_rollback(True)

        self.stdout.write(self.style.MIGRATE_HEADING('\n== Bilan ==\n'))
        self.stdout.write(
            f"annonces de test        : {n_annonces}\n"
            f"parcelles orphelines    : {n_parcelles}\n"
            f"lignes AgriScore legacy : {n_agriscore}\n"
            f"comptes de test         : {n_users}"
        )

        # Filet de sécurité : le scrapé doit être rigoureusement intact.
        scr_annonces_apres = Annonce.objects.filter(source__in=SOURCES_SCRAPEES).count()
        scr_photos_apres = _photos_scrapees()
        if not dry and (scr_annonces_apres != scr_annonces_avant or scr_photos_apres != scr_photos_avant):
            raise CommandError(
                "ANOMALIE : le volume de données scrapées a changé "
                f"(annonces {scr_annonces_avant}->{scr_annonces_apres}, "
                f"photos {scr_photos_avant}->{scr_photos_apres}). "
                "Transaction annulée — rien n'a été écrit."
            )
        self.stdout.write(self.style.SUCCESS(
            f"\nScrapé intact : {scr_annonces_apres} annonces / {scr_photos_apres} photos "
            f"(avito + mubawab), inchangé."
        ))
        if dry:
            self.stdout.write(self.style.WARNING("--dry-run : aucune écriture effectuée."))

    # ── Étapes ───────────────────────────────────────────────────────────

    def _supprimer_annonces_de_test(self, dry):
        """Annonces internes qui ne sont pas du jeu de démonstration."""
        qs = Annonce.objects.filter(source='interne').exclude(
            proprietaire__email__in=EMAILS_DEMO
        )
        for a in qs:
            self.stdout.write(f"  annonce  [{a.statut:9}] {a.titre[:50]:50} ({a.proprietaire.email})")
        n = qs.count()
        if not dry:
            qs.delete()  # cascade : photos, conversations, favoris, notifications, stats
        return n

    def _supprimer_parcelles_orphelines(self, dry):
        """Parcelles sans aucune annonce (donc jamais scrapées : une parcelle
        scrapée a toujours au moins son annonce d'import)."""
        qs = (
            Parcelle.objects.annotate(n=Count('annonces')).filter(n=0)
            .exclude(annonces__source__in=SOURCES_SCRAPEES)  # ceinture + bretelles
        )
        n = qs.count()
        self.stdout.write(f"  {n} parcelle(s) orpheline(s)")
        if not dry:
            qs.delete()  # cascade : donnees_geo, scores
        return n

    def _supprimer_agriscore_legacy(self, dry):
        """Modèle annonces.AgriScore : dormant (retiré de l'API publique le
        2026-08-30), alimenté seulement par des random.uniform() de seed."""
        n = AgriScore.objects.count()
        self.stdout.write(f"  {n} ligne(s) AgriScore (modèle legacy dormant)")
        if not dry:
            AgriScore.objects.all().delete()
        return n

    def _supprimer_comptes_de_test(self, dry):
        """Comptes sans annonce ni conversation, hors comptes protégés
        (superuser, scraper.*, demo.vendeur*)."""
        proteges = EMAILS_DEMO | EMAILS_SCRAPER
        qs = (
            User.objects
            .annotate(na=Count('annonces', distinct=True), nc=Count('conversations_initiees', distinct=True))
            .filter(na=0, nc=0, is_superuser=False)
            .exclude(email__in=proteges)
        )
        for u in qs:
            self.stdout.write(f"  compte   {u.email}")
        n = qs.count()
        if not dry:
            qs.delete()  # cascade : favoris, recherches sauvegardées, notifications
        return n


def _photos_scrapees():
    from annonces.models import Photo
    return Photo.objects.filter(annonce__source__in=SOURCES_SCRAPEES).count()
