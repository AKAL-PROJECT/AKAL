"""
Management command : seed_demo
Génère ~15 annonces réalistes pour la démo d'intégration front/back.

Usage:
    python manage.py seed_demo                   # Créer les données
    python manage.py seed_demo --clear            # Supprimer les données de démo

Particularités (conformes au PDF Amelioration I-4) :
    - Régions variées, statuts fonciers variés
    - Une annonce SANS photo (test du cas photo_principale=null)
    - Photos avec ordre commençant à 0 (photo principale = ordre 0)
    - Aucun score semé : le modèle legacy annonces.AgriScore a été supprimé
      (2026-09-09) — la vraie évaluation est le Passeport (app agriscore/).
"""

import os
import random
import uuid
from decimal import Decimal
from io import BytesIO

from django.contrib.gis.geos import Point
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.text import slugify

from accounts.models import User
from annonces.models import Annonce, Parcelle, Photo
from geo.models import Commune, CommuneGeom, Province, Region


# ══════════════════════════════════════════════════════════════
# DONNÉES DE RÉFÉRENCE
# ══════════════════════════════════════════════════════════════

GEO_REGIONS = [
    {'id': 1, 'nom': 'Fès-Meknès', 'code': 'fes-meknes'},
    {'id': 2, 'nom': 'Marrakech-Safi', 'code': 'marrakech-safi'},
    {'id': 3, 'nom': 'Souss-Massa', 'code': 'souss-massa'},
    {'id': 4, 'nom': 'Rabat-Salé-Kénitra', 'code': 'rabat-sale-kenitra'},
    {'id': 5, 'nom': 'Béni Mellal-Khénifra', 'code': 'beni-mellal-khenifra'},
    {'id': 6, 'nom': 'Drâa-Tafilalet', 'code': 'draa-tafilalet'},
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

# ── Annonces réalistes ──────────────────────────────────────
# 15 annonces avec des données variées

DEMO_ANNONCES = [
    {
        'titre': 'Terrain irrigué plaine du Saïss',
        'description': 'Magnifique terrain de 12 hectares dans la plaine du Saïss, '
                       'entièrement irrigué par un réseau de seguias modernisé. Sol argilo-calcaire '
                       'idéal pour la céréaliculture et l\'oléiculture. Accès goudronné depuis la RN13. '
                       'Titre foncier en règle, aucune servitude.',
        'prix': 850000, 'surface': 12.0, 'commune_id': 1001,
        'statut_foncier': 'melkia', 'acces_eau': 'irriguee',
        'topographie': 'plat', 'acces_routier': 'goudron',
        'cultures': ['Blé', 'Olivier'], 'lat': 33.89, 'lon': -5.55,
        'nb_photos': 3,
        # Cas de démo « localisation confidentielle » : fiche/carte publiques
        # ne montrent qu'une position floutée déterministe (cf. serializers.py).
        'loc_confidentielle': True,
    },
    {
        'titre': 'Exploitation arboricole Haouz',
        'description': 'Exploitation de 8 hectares dans le Haouz de Marrakech, plantée d\'oliviers '
                       'centenaires (450 arbres). Puits artésien de 80m avec débit garanti. '
                       'Rendement moyen de 5 tonnes d\'olives par saison. Clôturée et gardiennée.',
        'prix': 1200000, 'surface': 8.0, 'commune_id': 1004,
        'statut_foncier': 'immatricule', 'acces_eau': 'irriguee',
        'topographie': 'plat', 'acces_routier': 'goudron',
        'cultures': ['Olivier'], 'lat': 31.50, 'lon': -7.85,
        'nb_photos': 3,
    },
    {
        'titre': 'Parcelle Souss idéale agrumes',
        'description': 'Parcelle de 5.5 hectares au cœur de la plaine du Souss, zone reconnue '
                       'pour la production d\'agrumes. Système de goutte-à-goutte installé. '
                       'Proche de la station de conditionnement de Taroudant.',
        'prix': 680000, 'surface': 5.5, 'commune_id': 1007,
        'statut_foncier': 'melkia', 'acces_eau': 'irriguee',
        'topographie': 'plat', 'acces_routier': 'goudron',
        'cultures': ['Agrumes', 'Maraîchage'], 'lat': 30.40, 'lon': -9.00,
        'nb_photos': 2,
    },
    {
        'titre': 'Terre collective Gharb fertile',
        'description': 'Terrain soulaliya de 20 hectares dans la plaine du Gharb, '
                       'l\'une des zones agricoles les plus productives du Maroc. '
                       'Ideal pour la culture de canne à sucre et le maraîchage intensif. '
                       'Autorisation de mise en valeur obtenue.',
        'prix': 450000, 'surface': 20.0, 'commune_id': 1008,
        'statut_foncier': 'soulaliya', 'acces_eau': 'irriguee',
        'topographie': 'plat', 'acces_routier': 'piste',
        'cultures': ['Maraîchage', 'Fourrage'], 'lat': 34.26, 'lon': -6.58,
        'nb_photos': 2,
    },
    {
        'titre': 'Terrain bour céréalier Sidi Kacem',
        'description': 'Grande parcelle de 35 hectares en zone bour dans la province de Sidi Kacem. '
                       'Sol profond adapté à la céréaliculture pluviale (blé tendre, orge). '
                       'Rendement historique de 25 quintaux/ha en année normale.',
        'prix': 350000, 'surface': 35.0, 'commune_id': 1009,
        'statut_foncier': 'guich', 'acces_eau': 'bour',
        'topographie': 'vallonne', 'acces_routier': 'piste',
        'cultures': ['Blé', 'Fourrage'], 'lat': 34.23, 'lon': -5.71,
        'nb_photos': 2,
    },
    {
        'titre': 'Domaine oléicole Béni Mellal',
        'description': 'Domaine de 15 hectares avec 1200 oliviers en production. '
                       'Système d\'irrigation par bassin de rétention. '
                       'Hangar de stockage de 200m2 et logement gardien inclus. '
                       'Titre foncier immatriculé, libre de toute hypothèque.',
        'prix': 2500000, 'surface': 15.0, 'commune_id': 1010,
        'statut_foncier': 'immatricule', 'acces_eau': 'mixte',
        'topographie': 'pentu', 'acces_routier': 'goudron',
        'cultures': ['Olivier', 'Amandier'], 'lat': 32.34, 'lon': -6.36,
        'nb_photos': 3,
    },
    {
        'titre': 'Parcelle habous Fès — en cours de melkisation',
        'description': 'Parcelle habous de 3 hectares en périphérie de Fès. '
                       'Procédure de melkisation en cours (avancement 70%). '
                       'Sol limono-argileux bien drainé. Vue dégagée sur les collines du Prérif.',
        'prix': 180000, 'surface': 3.0, 'commune_id': 1003,
        'statut_foncier': 'habous', 'acces_eau': 'bour',
        'topographie': 'vallonne', 'acces_routier': 'piste',
        'cultures': ['Blé', 'Vigne'], 'lat': 34.03, 'lon': -5.00,
        'nb_photos': 1,
    },
    {
        'titre': 'Oasis Errachidia palmier dattier',
        'description': 'Palmeraie de 2.5 hectares dans l\'oasis d\'Errachidia. '
                       '180 palmiers dattiers variété Mejhoul (haute valeur). '
                       'Khettara en fonctionnement + puits moderne. '
                       'Production estimée à 4 tonnes/an.',
        'prix': 750000, 'surface': 2.5, 'commune_id': 1012,
        'statut_foncier': 'melkia', 'acces_eau': 'irriguee',
        'topographie': 'plat', 'acces_routier': 'goudron',
        'cultures': ['Palmier dattier'], 'lat': 31.93, 'lon': -4.43,
        'nb_photos': 2,
    },
    {
        'titre': 'Terrain arganier Souss',
        'description': 'Parcelle de 7 hectares avec arganiers naturels dans la zone de Taroudant. '
                       'L\'arganier est un arbre endémique du Maroc protégé par l\'UNESCO. '
                       'Exploitation possible en coopérative. Zone à fort potentiel touristique.',
        'prix': 520000, 'surface': 7.0, 'commune_id': 1006,
        'statut_foncier': 'soulaliya', 'acces_eau': 'bour',
        'topographie': 'pentu', 'acces_routier': 'piste',
        'cultures': ['Arganier'], 'lat': 30.42, 'lon': -9.48,
        'nb_photos': 2,
    },
    {
        'titre': 'Grande exploitation Kelâa des Sraghna',
        'description': 'Vaste exploitation agricole de 45 hectares dans la plaine de la Kelâa. '
                       'Barrage collinaire privé. Deux forages en activité. '
                       'Idéal pour un projet agro-industriel (céréales, tournesol, betterave).',
        'prix': 4500000, 'surface': 45.0, 'commune_id': 1005,
        'statut_foncier': 'immatricule', 'acces_eau': 'irriguee',
        'topographie': 'plat', 'acces_routier': 'goudron',
        'cultures': ['Blé', 'Maraîchage', 'Fourrage'], 'lat': 32.05, 'lon': -7.41,
        'nb_photos': 3,
    },
    {
        'titre': 'Parcelle maraîchère Kénitra',
        'description': 'Petite parcelle de 1.8 hectare idéale pour le maraîchage sous serre. '
                       'Eau d\'irrigation depuis le canal du Gharb. '
                       'Proximité du marché de gros de Kénitra (15 min).',
        'prix': 280000, 'surface': 1.8, 'commune_id': 1008,
        'statut_foncier': 'melkia', 'acces_eau': 'irriguee',
        'topographie': 'plat', 'acces_routier': 'goudron',
        'cultures': ['Maraîchage'], 'lat': 34.27, 'lon': -6.57,
        'nb_photos': 2,
    },
    {
        'titre': 'Terrain viticole El Hajeb',
        'description': 'Terrain de 4 hectares planté en vignoble (cépages de table). '
                       'Altitude 800m, climat frais favorable. Station de pompage privée. '
                       'Le domaine est clôturé et dispose d\'un local technique.',
        'prix': 600000, 'surface': 4.0, 'commune_id': 1002,
        'statut_foncier': 'melkia', 'acces_eau': 'mixte',
        'topographie': 'pentu', 'acces_routier': 'goudron',
        'cultures': ['Vigne'], 'lat': 33.69, 'lon': -5.37,
        'nb_photos': 2,
    },
    {
        'titre': 'Terrain difficile d\'accès Khénifra',
        'description': 'Parcelle isolée de 25 hectares en zone montagneuse près de Khénifra. '
                       'Piste d\'accès de 12 km depuis la route principale. '
                       'Potentiel pastoral et apicole important. Source naturelle sur place.',
        'prix': 150000, 'surface': 25.0, 'commune_id': 1011,
        'statut_foncier': 'guich', 'acces_eau': 'mixte',
        'topographie': 'pentu', 'acces_routier': 'difficile',
        'cultures': ['Fourrage', 'Cactus'], 'lat': 32.93, 'lon': -5.67,
        'nb_photos': 1,
    },
    {
        'titre': 'Ferme équipée Ouarzazate',
        'description': 'Ferme de 6 hectares dans la vallée du Drâa, équipée de serres canariennes '
                       'sur 2 hectares. Forage de 120m avec pompe solaire. '
                       'Production de tomates et poivrons pour l\'export.',
        'prix': 1800000, 'surface': 6.0, 'commune_id': 1013,
        'statut_foncier': 'melkia', 'acces_eau': 'irriguee',
        'topographie': 'plat', 'acces_routier': 'goudron',
        'cultures': ['Maraîchage', 'Palmier dattier'], 'lat': 30.92, 'lon': -6.90,
        'nb_photos': 0,  # ← PAS DE PHOTO (test du cas photo_principale=null)
    },
    {
        'titre': 'Terre céréalière Aïn Taoujdate',
        'description': 'Parcelle de 10 hectares dans la commune d\'Aïn Taoujdate. '
                       'Terrain plat et bien drainé, historiquement cultivé en blé dur et orge. '
                       'Proximité du souk hebdomadaire et de l\'axe Meknès-Fès.',
        'prix': 420000, 'surface': 10.0, 'commune_id': 1001,
        'statut_foncier': 'melkia', 'acces_eau': 'bour',
        'topographie': 'plat', 'acces_routier': 'piste',
        'cultures': ['Blé'], 'lat': 33.95, 'lon': -5.22,
        'nb_photos': 2,
    },
]

SEED_USERS = [
    {'email': 'demo.vendeur1@akal.ma', 'nom': 'El Fassi', 'prenom': 'Ahmed'},
    {'email': 'demo.vendeur2@akal.ma', 'nom': 'Benkirane', 'prenom': 'Fatima'},
    {'email': 'demo.vendeur3@akal.ma', 'nom': 'Ouazzani', 'prenom': 'Karim'},
]


class Command(BaseCommand):
    help = (
        'Génère ~15 annonces réalistes pour la démo d\'intégration front/back. '
        'Régions variées, statuts variés, une sans photo.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Supprimer les données de démo et quitter',
        )

    def handle(self, *args, **options):
        if options['clear']:
            self._clear()
            return

        self.stdout.write(self.style.MIGRATE_HEADING(
            '\n== AKAL Demo Seeder — ~15 annonces realistes ==\n'
        ))

        communes = self._seed_geo()
        users = self._seed_users()

        # commune_geom (référentiel officiel) alimente le filtre catalogue
        # province/commune, is_geolocated() et can_publish() — sans lui, les
        # annonces de démo sont invisibles au filtre cascade. Il est renseigné
        # par jointure spatiale dans _seed_annonces() ; encore faut-il que le
        # référentiel soit importé.
        if not CommuneGeom.objects.exists():
            self.stdout.write(self.style.WARNING(
                "   ! CommuneGeom vide — lancez `manage.py import_geo_officiel` "
                "puis `manage.py backfill_commune_geom`, sinon le filtre "
                "province/commune du catalogue restera vide pour ces annonces."
            ))

        self._seed_annonces(communes, users)

        self.stdout.write(self.style.SUCCESS('\nSeed demo termine avec succes !'))
        emails_demo = [u['email'] for u in SEED_USERS]
        annonces_demo = Annonce.objects.filter(proprietaire__email__in=emails_demo)
        self.stdout.write(f'   {annonces_demo.count()} annonces de démo (proprios seed_demo)')
        self.stdout.write(f'   {Photo.objects.filter(annonce__in=annonces_demo).count()} photos')

    # ── Géo ──────────────────────────────────────

    def _seed_geo(self):
        self.stdout.write('Donnees geographiques...')
        for r in GEO_REGIONS:
            Region.objects.update_or_create(id=r['id'], defaults={'nom': r['nom'], 'code': r['code']})
        for p in GEO_PROVINCES:
            Province.objects.update_or_create(
                id=p['id'], defaults={'region_id': p['region_id'], 'nom': p['nom'], 'code': p['code']}
            )
        communes = {}
        for c in GEO_COMMUNES:
            obj, _ = Commune.objects.update_or_create(
                id=c['id'], defaults={'province_id': c['province_id'], 'nom': c['nom']}
            )
            communes[c['id']] = obj
        self.stdout.write(self.style.SUCCESS(
            f'   OK: {len(GEO_REGIONS)} regions, {len(GEO_PROVINCES)} provinces, {len(communes)} communes'
        ))
        return communes

    # ── Utilisateurs ─────────────────────────────

    def _seed_users(self):
        self.stdout.write('Utilisateurs de demo...')
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
                user.set_password('demo1234')
                user.save()
            users.append(user)
        self.stdout.write(self.style.SUCCESS(f'   OK: {len(users)} utilisateurs'))
        return users

    # ── Annonces ─────────────────────────────────

    def _seed_annonces(self, communes, users):
        self.stdout.write(f'Creation de {len(DEMO_ANNONCES)} annonces...')
        now = timezone.now()

        for i, data in enumerate(DEMO_ANNONCES):
            point = Point(data['lon'], data['lat'], srid=4326)
            # Jointure spatiale sur le référentiel officiel (polygone qui
            # contient le point) — jamais deviné : None si le référentiel
            # n'est pas importé ou si le point tombe hors de toute commune.
            commune_geom = (
                CommuneGeom.objects.filter(geom__contains=point).first()
            )

            # Parcelle
            parcelle = Parcelle.objects.create(
                commune=communes[data['commune_id']],
                commune_geom=commune_geom,
                surface_ha=Decimal(str(data['surface'])),
                statut_foncier=data['statut_foncier'],
                acces_eau=data['acces_eau'],
                topographie=data['topographie'],
                acces_routier=data['acces_routier'],
                latitude=data['lat'],
                longitude=data['lon'],
                geom=point,
                metadata={'culture': data['cultures']},
            )

            # Annonce
            annonce_id = uuid.uuid4()
            slug = f"{slugify(data['titre'])}-{str(annonce_id)[:8]}"
            annonce = Annonce.objects.create(
                id=annonce_id,
                parcelle=parcelle,
                proprietaire=users[i % len(users)],
                slug=slug,
                titre=data['titre'],
                description=data['description'],
                prix_mad=Decimal(str(data['prix'])),
                statut='en_ligne',
                date_publication=now,
                loc_confidentielle=data.get('loc_confidentielle', False),
            )

            # Pas de score semé : le modèle legacy annonces.AgriScore a été
            # supprimé (2026-09-09). La vraie évaluation est le Passeport
            # (app agriscore/), calculée en direct, jamais stockée.

            # Photos (si nb_photos > 0)
            nb_photos = data.get('nb_photos', 0)
            for ordre in range(nb_photos):
                # Génère un placeholder de 1x1 pixel PNG (pas de téléchargement réseau)
                photo = Photo.objects.create(
                    annonce=annonce,
                    ordre=ordre,
                )
                # Créer un placeholder image minimaliste
                placeholder = self._create_placeholder_image(data['titre'], ordre)
                photo.image.save(
                    f"demo_{slug}_{ordre}.png",
                    ContentFile(placeholder),
                    save=True,
                )

            extra = " (sans photo)" if nb_photos == 0 else ""

            self.stdout.write(f'   [{i+1}/{len(DEMO_ANNONCES)}] {data["titre"]}{extra}')

        self.stdout.write(self.style.SUCCESS(f'   OK: {len(DEMO_ANNONCES)} annonces creees'))

    # ── Placeholder image ────────────────────────

    def _create_placeholder_image(self, titre, ordre):
        """Crée un placeholder PNG avec Pillow."""
        try:
            from PIL import Image, ImageDraw, ImageFont

            img = Image.new('RGB', (800, 600), color=(
                random.randint(40, 100),
                random.randint(80, 160),
                random.randint(40, 100),
            ))
            draw = ImageDraw.Draw(img)

            # Texte centré
            text = f"{titre[:30]}\nPhoto {ordre + 1}"
            try:
                font = ImageFont.truetype("arial.ttf", 28)
            except (OSError, IOError):
                font = ImageFont.load_default()

            # Calcul position centrée
            bbox = draw.textbbox((0, 0), text, font=font)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]
            x = (800 - text_w) // 2
            y = (600 - text_h) // 2
            draw.text((x, y), text, fill='white', font=font)

            buffer = BytesIO()
            img.save(buffer, format='PNG')
            return buffer.getvalue()

        except ImportError:
            # Fallback: 1x1 pixel PNG si Pillow n'est pas disponible
            import struct
            import zlib
            def create_minimal_png():
                signature = b'\x89PNG\r\n\x1a\n'
                ihdr_data = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
                ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
                ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
                raw = b'\x00\x00\x80\x00'
                idat_data = zlib.compress(raw)
                idat_crc = zlib.crc32(b'IDAT' + idat_data) & 0xffffffff
                idat = struct.pack('>I', len(idat_data)) + b'IDAT' + idat_data + struct.pack('>I', idat_crc)
                iend_crc = zlib.crc32(b'IEND') & 0xffffffff
                iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
                return signature + ihdr + idat + iend
            return create_minimal_png()

    # ── Nettoyage ────────────────────────────────

    def _clear(self):
        self.stdout.write(self.style.WARNING('Suppression des donnees de demo...'))
        demo_emails = [u['email'] for u in SEED_USERS]

        deleted_annonces, _ = Annonce.objects.filter(
            proprietaire__email__in=demo_emails
        ).delete()
        self.stdout.write(f'   {deleted_annonces} annonces supprimees (cascade: photos, stats)')

        deleted_parcelles, _ = Parcelle.objects.filter(annonces__isnull=True).delete()
        self.stdout.write(f'   {deleted_parcelles} parcelles orphelines supprimees')

        deleted_users, _ = User.objects.filter(email__in=demo_emails).delete()
        self.stdout.write(f'   {deleted_users} utilisateurs de demo supprimes')

        self.stdout.write(self.style.SUCCESS('Nettoyage termine.'))
