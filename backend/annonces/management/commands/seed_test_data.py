"""
Management command : seed_test_data
Génère 100 000 annonces de test pour le benchmarking de performance.

Usage:
    python manage.py seed_test_data
    python manage.py seed_test_data --count 50000   # Nombre personnalisé
    python manage.py seed_test_data --clear          # Supprimer les données de test uniquement

Dépendances:
    pip install Faker
"""

import random
import time
import uuid
from decimal import Decimal

from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.text import slugify
from faker import Faker

from accounts.models import User
from annonces.models import Annonce, Parcelle
from geo.models import Commune, Province, Region


# ══════════════════════════════════════════════════════════════
# CONSTANTES
# ══════════════════════════════════════════════════════════════

BATCH_SIZE = 5_000

# Bounding box du Maroc (coordonnées GPS approximatives)
MAROC_LAT_MIN = 27.6
MAROC_LAT_MAX = 35.9
MAROC_LON_MIN = -13.2
MAROC_LON_MAX = -1.0

# Données géographiques (réutilisées depuis seed_parcelles.py)
GEO_REGIONS = [
    {'id': 1, 'nom': 'Fès-Meknès', 'code': 'FM'},
    {'id': 2, 'nom': 'Marrakech-Safi', 'code': 'MS'},
    {'id': 3, 'nom': 'Souss-Massa', 'code': 'SM'},
    {'id': 4, 'nom': 'Rabat-Salé-Kénitra', 'code': 'RSK'},
    {'id': 5, 'nom': 'Béni Mellal-Khénifra', 'code': 'BMK'},
    {'id': 6, 'nom': 'Drâa-Tafilalet', 'code': 'DT'},
]

GEO_PROVINCES = [
    {'id': 101, 'region_id': 1, 'nom': 'Meknès', 'code': 'MEK'},
    {'id': 102, 'region_id': 1, 'nom': 'Fès', 'code': 'FES'},
    {'id': 103, 'region_id': 2, 'nom': 'Marrakech', 'code': 'MRK'},
    {'id': 104, 'region_id': 2, 'nom': 'El Kelâa des Sraghna', 'code': 'EKS'},
    {'id': 105, 'region_id': 3, 'nom': 'Agadir-Ida-Ou-Tanane', 'code': 'AGD'},
    {'id': 106, 'region_id': 3, 'nom': 'Taroudant', 'code': 'TRD'},
    {'id': 107, 'region_id': 4, 'nom': 'Kénitra', 'code': 'KEN'},
    {'id': 108, 'region_id': 4, 'nom': 'Sidi Kacem', 'code': 'SDK'},
    {'id': 109, 'region_id': 5, 'nom': 'Béni Mellal', 'code': 'BEM'},
    {'id': 110, 'region_id': 5, 'nom': 'Khénifra', 'code': 'KHN'},
    {'id': 111, 'region_id': 6, 'nom': 'Errachidia', 'code': 'ERR'},
    {'id': 112, 'region_id': 6, 'nom': 'Ouarzazate', 'code': 'OUZ'},
]

GEO_COMMUNES = [
    {'id': 1001, 'province_id': 101, 'nom': 'Aïn Taoujdate'},
    {'id': 1002, 'province_id': 101, 'nom': 'El Hajeb'},
    {'id': 1003, 'province_id': 102, 'nom': 'Fès Médina'},
    {'id': 1004, 'province_id': 103, 'nom': 'Tahannaout'},
    {'id': 1005, 'province_id': 104, 'nom': 'El Kelâa des Sraghna'},
    {'id': 1006, 'province_id': 105, 'nom': 'Aït Melloul'},
    {'id': 1007, 'province_id': 106, 'nom': 'Taroudant'},
    {'id': 1008, 'province_id': 107, 'nom': 'Kénitra'},
    {'id': 1009, 'province_id': 108, 'nom': 'Sidi Kacem'},
    {'id': 1010, 'province_id': 109, 'nom': 'Béni Mellal'},
    {'id': 1011, 'province_id': 110, 'nom': 'Khénifra'},
    {'id': 1012, 'province_id': 111, 'nom': 'Errachidia'},
    {'id': 1013, 'province_id': 112, 'nom': 'Ouarzazate'},
]

# Types de cultures pour le champ metadata
CULTURES = [
    'Blé', 'Olivier', 'Arganier', 'Maraîchage', 'Agrumes',
    'Fourrage', 'Palmier dattier', 'Vigne', 'Amandier', 'Cactus',
]

# Choix extraits des TextChoices des modèles
STATUTS_FONCIERS = ['melkia', 'soulaliya', 'guich', 'habous', 'immatricule']
ACCES_EAU = ['irriguee', 'bour', 'mixte']
TOPOGRAPHIES = ['plat', 'pentu', 'vallonne']
ACCES_ROUTIERS = ['goudron', 'piste', 'difficile']

# Titres réalistes pour les annonces
TITRE_PREFIXES = [
    'Terrain agricole', 'Parcelle irriguée', 'Ferme productive',
    'Exploitation agricole', 'Terre fertile', 'Domaine agricole',
    'Terrain de culture', 'Parcelle de terre', 'Propriété rurale',
    'Terrain à vendre',
]

TITRE_SUFFIXES = [
    'avec vue montagne', 'accès eau garanti', 'proche route nationale',
    'idéal investissement', 'rendement élevé', 'titre foncier propre',
    'sol riche', 'clôturé', 'avec puits', 'zone fertile',
    'plaine du Gharb', 'plaine du Souss', 'région de Meknès',
    'Haouz de Marrakech', 'vallée du Drâa',
]


# ══════════════════════════════════════════════════════════════
# UTILISATEURS DE TEST
# ══════════════════════════════════════════════════════════════

SEED_USERS = [
    {'email': 'loadtest1@akal.ma', 'nom': 'Bencherki', 'prenom': 'Youssef'},
    {'email': 'loadtest2@akal.ma', 'nom': 'Amrani', 'prenom': 'Khadija'},
    {'email': 'loadtest3@akal.ma', 'nom': 'Tazi', 'prenom': 'Omar'},
    {'email': 'loadtest4@akal.ma', 'nom': 'Berrada', 'prenom': 'Salma'},
    {'email': 'loadtest5@akal.ma', 'nom': 'Idrissi', 'prenom': 'Mehdi'},
]


class Command(BaseCommand):
    help = 'Génère 100 000 annonces de test pour le benchmarking de performance.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--count',
            type=int,
            default=100_000,
            help='Nombre d\'annonces à générer (défaut: 100 000)',
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Supprimer les données de test (utilisateurs loadtest*@akal.ma) et quitter',
        )

    def handle(self, *args, **options):
        count = options['count']

        if options['clear']:
            self._clear_test_data()
            return

        self.stdout.write(self.style.MIGRATE_HEADING(
            f'\n══ AKAL Load Test Seeder — {count:,} annonces ══\n'
        ))

        start = time.time()

        # Étape 1 : Données géographiques
        communes = self._seed_geo()

        # Étape 2 : Utilisateurs de test
        users = self._seed_users()

        # Étape 3 : Parcelles (bulk_create par lots de BATCH_SIZE)
        parcelles = self._seed_parcelles(count, communes)

        # Étape 4 : Annonces (bulk_create par lots de BATCH_SIZE)
        self._seed_annonces(count, parcelles, users)

        elapsed = time.time() - start

        self.stdout.write(self.style.SUCCESS(
            f'\n✅ Seeding terminé en {elapsed:.1f}s'
        ))
        self.stdout.write(f'   • {Region.objects.count()} régions')
        self.stdout.write(f'   • {Province.objects.count()} provinces')
        self.stdout.write(f'   • {Commune.objects.count()} communes')
        self.stdout.write(f'   • {User.objects.filter(email__endswith="@akal.ma").count()} utilisateurs')
        self.stdout.write(f'   • {Parcelle.objects.count()} parcelles')
        self.stdout.write(f'   • {Annonce.objects.count()} annonces')

    # ──────────────────────────────────────────────
    # Données géographiques
    # ──────────────────────────────────────────────

    def _seed_geo(self):
        """Crée les régions, provinces et communes si elles n'existent pas."""
        self.stdout.write('📍 Création des données géographiques...')

        for r in GEO_REGIONS:
            Region.objects.get_or_create(id=r['id'], defaults={'nom': r['nom'], 'code': r['code']})

        for p in GEO_PROVINCES:
            Province.objects.get_or_create(
                id=p['id'],
                defaults={'region_id': p['region_id'], 'nom': p['nom'], 'code': p['code']},
            )

        communes = []
        for c in GEO_COMMUNES:
            obj, _ = Commune.objects.get_or_create(
                id=c['id'],
                defaults={'province_id': c['province_id'], 'nom': c['nom']},
            )
            communes.append(obj)

        self.stdout.write(self.style.SUCCESS(
            f'   ✓ {len(GEO_REGIONS)} régions, {len(GEO_PROVINCES)} provinces, {len(communes)} communes'
        ))
        return communes

    # ──────────────────────────────────────────────
    # Utilisateurs
    # ──────────────────────────────────────────────

    def _seed_users(self):
        """Crée les utilisateurs de test pour le load testing."""
        self.stdout.write('👤 Création des utilisateurs de test...')

        users = []
        for u in SEED_USERS:
            user, created = User.objects.get_or_create(
                email=u['email'],
                defaults={
                    'nom': u['nom'],
                    'prenom': u['prenom'],
                    'role': 'VENDEUR',
                    'is_verified': True,
                },
            )
            if created:
                user.set_password('loadtest2026')
                user.save()
            users.append(user)

        self.stdout.write(self.style.SUCCESS(f'   ✓ {len(users)} utilisateurs'))
        return users

    # ──────────────────────────────────────────────
    # Parcelles — bulk_create par lots de 5 000
    # ──────────────────────────────────────────────

    def _seed_parcelles(self, count, communes):
        """
        Génère `count` parcelles avec des Points PostGIS valides
        dans le bounding box du Maroc.

        Utilise bulk_create par lots de BATCH_SIZE pour optimiser
        l'insertion en base.
        """
        self.stdout.write(f'🌍 Génération de {count:,} parcelles (lots de {BATCH_SIZE:,})...')

        fake = Faker('fr_FR')
        parcelles = []
        all_parcelle_ids = []

        for i in range(count):
            parcelle_id = uuid.uuid4()
            commune = random.choice(communes)
            lat = random.uniform(MAROC_LAT_MIN, MAROC_LAT_MAX)
            lon = random.uniform(MAROC_LON_MIN, MAROC_LON_MAX)

            # Sélection aléatoire de 1 à 3 cultures
            nb_cultures = random.randint(1, 3)
            cultures = random.sample(CULTURES, nb_cultures)

            parcelle = Parcelle(
                id=parcelle_id,
                commune=commune,
                surface_ha=Decimal(str(round(random.uniform(0.5, 500.0), 2))),
                statut_foncier=random.choice(STATUTS_FONCIERS),
                acces_eau=random.choice(ACCES_EAU),
                topographie=random.choice(TOPOGRAPHIES),
                acces_routier=random.choice(ACCES_ROUTIERS),
                latitude=lat,
                longitude=lon,
                geom=Point(lon, lat, srid=4326),  # Point(x=lon, y=lat)
                metadata={'culture': cultures},
            )

            parcelles.append(parcelle)
            all_parcelle_ids.append(parcelle_id)

            # Flush par lot
            if len(parcelles) >= BATCH_SIZE:
                Parcelle.objects.bulk_create(parcelles, batch_size=BATCH_SIZE)
                self.stdout.write(f'   ... {i + 1:,}/{count:,} parcelles insérées')
                parcelles = []

        # Derniers éléments restants
        if parcelles:
            Parcelle.objects.bulk_create(parcelles, batch_size=BATCH_SIZE)

        self.stdout.write(self.style.SUCCESS(f'   ✓ {count:,} parcelles créées'))

        # Retourne les IDs pour lier les annonces
        return all_parcelle_ids

    # ──────────────────────────────────────────────
    # Annonces — bulk_create par lots de 5 000
    # ──────────────────────────────────────────────

    def _seed_annonces(self, count, parcelle_ids, users):
        """
        Génère `count` annonces liées 1:1 aux parcelles.

        Toutes les annonces sont créées avec statut 'en_ligne'
        pour être visibles dans le catalogue lors du test de charge.
        """
        self.stdout.write(f'📝 Génération de {count:,} annonces (lots de {BATCH_SIZE:,})...')

        fake = Faker('fr_FR')
        annonces = []
        now = timezone.now()

        for i in range(count):
            annonce_id = uuid.uuid4()
            titre = f"{random.choice(TITRE_PREFIXES)} — {random.choice(TITRE_SUFFIXES)}"
            slug = f"{slugify(titre)}-{str(annonce_id)[:8]}"

            annonce = Annonce(
                id=annonce_id,
                parcelle_id=parcelle_ids[i],
                proprietaire=random.choice(users),
                slug=slug,
                titre=titre,
                description=fake.paragraph(nb_sentences=5),
                prix_mad=Decimal(str(random.randint(50_000, 5_000_000))),
                statut='en_ligne',
                loc_confidentielle=random.choice([True, False]),
                date_publication=fake.date_time_between(
                    start_date='-6M', end_date='now', tzinfo=now.tzinfo,
                ),
                created_at=now,
                updated_at=now,
            )

            annonces.append(annonce)

            # Flush par lot
            if len(annonces) >= BATCH_SIZE:
                Annonce.objects.bulk_create(annonces, batch_size=BATCH_SIZE)
                self.stdout.write(f'   ... {i + 1:,}/{count:,} annonces insérées')
                annonces = []

        # Derniers éléments restants
        if annonces:
            Annonce.objects.bulk_create(annonces, batch_size=BATCH_SIZE)

        self.stdout.write(self.style.SUCCESS(f'   ✓ {count:,} annonces créées'))

    # ──────────────────────────────────────────────
    # Nettoyage
    # ──────────────────────────────────────────────

    def _clear_test_data(self):
        """Supprime les données créées par ce seeder."""
        self.stdout.write(self.style.WARNING('🗑️  Suppression des données de test...'))

        # Supprimer les annonces dont le propriétaire est un utilisateur loadtest
        test_emails = [u['email'] for u in SEED_USERS]
        deleted_annonces, _ = Annonce.objects.filter(
            proprietaire__email__in=test_emails
        ).delete()
        self.stdout.write(f'   • {deleted_annonces} annonces supprimées')

        # Supprimer les parcelles orphelines (sans annonce liée)
        deleted_parcelles, _ = Parcelle.objects.filter(annonces__isnull=True).delete()
        self.stdout.write(f'   • {deleted_parcelles} parcelles orphelines supprimées')

        # Supprimer les utilisateurs de test
        deleted_users, _ = User.objects.filter(email__in=test_emails).delete()
        self.stdout.write(f'   • {deleted_users} utilisateurs de test supprimés')

        self.stdout.write(self.style.SUCCESS('✅ Nettoyage terminé.'))
