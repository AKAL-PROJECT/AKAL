"""
Management command : seed_comptes_demo
Prépare les comptes et la file de modération pour la démo en soutenance.

Usage:
    python manage.py seed_comptes_demo                        # mot de passe : AKAL_DEMO_PASSWORD
    python manage.py seed_comptes_demo --password 'xxxx'
    python manage.py seed_comptes_demo --clear                # supprime comptes + données créés ici

Crée (idempotent, relançable sans doublon) :
    - demo.admin@akal.ma        superutilisateur (accès /admin)
    - demo.moderateur@akal.ma   membre du groupe "Moderateur" (dashboard /moderation)
    - demo.vendeur@akal.ma      vendeur, 3 annonces en_attente avec motif_moderation
    - demo.acheteur@akal.ma     acheteur, auteur d'un signalement ouvert

Les annonces en attente réutilisent les parcelles de seed_demo (lancé
automatiquement s'il n'a pas encore tourné), le signalement vise une annonce
en_ligne de seed_demo. Le groupe "Moderateur" est synchronisé via
init_groupes.

Mot de passe : jamais de valeur par défaut hors DEBUG — sur Render, passer
--password ou AKAL_DEMO_PASSWORD, sinon la commande refuse de tourner.
"""

import os
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User
from annonces.models import Annonce, Signalement

from .seed_demo import SEED_USERS

COMPTES = [
    {'email': 'demo.admin@akal.ma', 'prenom': 'Admin', 'nom': 'AKAL', 'role': 'ADMIN',
     'is_staff': True, 'is_superuser': True},
    {'email': 'demo.moderateur@akal.ma', 'prenom': 'Salma', 'nom': 'Modératrice', 'role': '',
     'moderateur': True},
    {'email': 'demo.vendeur@akal.ma', 'prenom': 'Youssef', 'nom': 'Alaoui', 'role': 'VENDEUR'},
    {'email': 'demo.acheteur@akal.ma', 'prenom': 'Nadia', 'nom': 'Berrada', 'role': 'ACHETEUR'},
]

# Chaque annonce illustre un signal différent du palier 1 (moderation.py) —
# le motif est celui qu'afficherait le dashboard pour un vrai détournement.
ANNONCES_EN_ATTENTE = [
    {
        'titre': 'Terrain agricole irrigué — affaire urgente',
        'description': (
            'Terrain irrigué avec puits. Prix sacrifié, paiement Western Union '
            'uniquement, contactez-moi sur WhatsApp 06 00 00 00 00.'
        ),
        'prix_mad': Decimal('45000'),
        'motif': 'Coordonnées dans la description ; mention de paiement hors plateforme ; '
                 'prix/m² anormalement bas',
    },
    {
        'titre': 'Lot de terrain constructible proche ville',
        'description': (
            'Idéal pour construire une villa ou un immeuble, viabilisé, '
            'à deux pas du centre-ville.'
        ),
        'prix_mad': Decimal('950000'),
        'motif': 'Annonce probablement hors sujet (terrain constructible, pas agricole)',
    },
    {
        'titre': 'Oliveraie 2 ha avec bassin',
        'description': (
            'Oliveraie en production, 400 pieds, bassin de stockage et accès '
            'goudronné. Titre foncier disponible.'
        ),
        'prix_mad': Decimal('38000000'),
        'motif': 'Prix/m² anormalement élevé pour la zone',
    },
]


class Command(BaseCommand):
    help = 'Crée les comptes de démo (admin, modérateur, vendeur, acheteur) et une file de modération.'

    def add_arguments(self, parser):
        parser.add_argument('--password', help='Mot de passe des 4 comptes (sinon AKAL_DEMO_PASSWORD).')
        parser.add_argument('--clear', action='store_true', help='Supprimer les comptes de démo et quitter.')

    def handle(self, *args, **options):
        emails = [c['email'] for c in COMPTES]
        if options['clear']:
            # CASCADE : annonces du vendeur et signalement de l'acheteur partent avec.
            n, _ = User.objects.filter(email__in=emails).delete()
            self.stdout.write(self.style.SUCCESS(f'Supprimé : {n} objet(s) (comptes de démo + dépendances).'))
            return

        password = options['password'] or os.environ.get('AKAL_DEMO_PASSWORD')
        if not password:
            if not settings.DEBUG:
                raise CommandError('Mot de passe requis hors DEBUG : --password ou AKAL_DEMO_PASSWORD.')
            password = 'demo1234'

        call_command('init_groupes', stdout=self.stdout)
        if not Annonce.objects.filter(proprietaire__email__in=[u['email'] for u in SEED_USERS]).exists():
            call_command('seed_demo', stdout=self.stdout)

        with transaction.atomic():
            comptes = self._seed_comptes(password)
            self._seed_annonces_en_attente(comptes['demo.vendeur@akal.ma'])
            self._seed_signalement(comptes['demo.acheteur@akal.ma'])

        self.stdout.write(self.style.SUCCESS('\nComptes de démo prêts :'))
        for email in emails:
            self.stdout.write(f'   {email}')

    def _seed_comptes(self, password):
        groupe = Group.objects.get(name='Moderateur')
        comptes = {}
        for c in COMPTES:
            user, _ = User.objects.update_or_create(
                email=c['email'],
                defaults={
                    'prenom': c['prenom'],
                    'nom': c['nom'],
                    'role': c['role'],
                    'is_staff': c.get('is_staff', False),
                    'is_superuser': c.get('is_superuser', False),
                    'is_verified': True,
                    'is_active': True,
                },
            )
            user.set_password(password)
            user.save()
            if c.get('moderateur'):
                user.groups.add(groupe)
            comptes[c['email']] = user
        return comptes

    def _seed_annonces_en_attente(self, vendeur):
        parcelles = [
            a.parcelle for a in Annonce.objects.filter(
                proprietaire__email__in=[u['email'] for u in SEED_USERS],
            ).select_related('parcelle').order_by('created_at')[:len(ANNONCES_EN_ATTENTE)]
        ]
        if len(parcelles) < len(ANNONCES_EN_ATTENTE):
            raise CommandError('Pas assez d\'annonces seed_demo pour réutiliser leurs parcelles.')

        for parcelle, data in zip(parcelles, ANNONCES_EN_ATTENTE):
            # Remis en_attente à chaque relance : après une démo où le
            # modérateur a tout validé/rejeté, la file se reconstitue.
            Annonce.objects.update_or_create(
                proprietaire=vendeur,
                titre=data['titre'],
                defaults={
                    'parcelle': parcelle,
                    'description': data['description'],
                    'prix_mad': data['prix_mad'],
                    'statut': Annonce.StatutAnnonce.EN_ATTENTE,
                    'motif_moderation': data['motif'],
                    'motif_rejet': '',
                    'date_publication': None,
                },
            )
        self.stdout.write(self.style.SUCCESS(f'   OK: {len(ANNONCES_EN_ATTENTE)} annonces en attente'))

    def _seed_signalement(self, acheteur):
        cible = Annonce.objects.filter(
            proprietaire__email__in=[u['email'] for u in SEED_USERS],
            statut=Annonce.StatutAnnonce.EN_LIGNE,
        ).order_by('-created_at').first()
        if cible is None:
            self.stdout.write(self.style.WARNING('   ! Aucune annonce en ligne à signaler.'))
            return
        Signalement.objects.get_or_create(
            annonce=cible,
            auteur=acheteur,
            statut=Signalement.Statut.OUVERT,
            defaults={
                'raison': Signalement.Raison.DEJA_VENDUE,
                'commentaire': "J'ai appelé le vendeur : il dit que le terrain est vendu depuis un mois.",
            },
        )
        self.stdout.write(self.style.SUCCESS(f'   OK: signalement ouvert sur « {cible.titre} »'))
