"""
Management command : import_scraped_data

Importe les annonces scrapées Avito/Mubawab (JSON, cf. annonces/data/scraped/)
dans le modèle AKAL — jamais présentées comme des annonces déposées par un
utilisateur authentifié (propriétaire = compte bot dédié par source),
jamais publiées automatiquement sans passer par les mêmes garde-fous que le
dépôt d'annonce réel (Annonce.can_publish(), transitions.py).

Idempotent : chaque annonce importée est identifiée par (source, source_id)
— une seconde exécution ne recrée jamais une annonce déjà importée (cf.
contrainte unique annonce_unique_source_id, migration 0008).

N'invente jamais de donnée absente :
    - prix/surface manquants ou nuls => entrée rejetée (comptée, jamais
      remplacée par une valeur arbitraire) ;
    - qualité du terrain (statut foncier précis, accès eau, topographie,
      accès routier) : aucun signal fiable dans les sources scrapées =>
      laissé NULL (Parcelle, nullable depuis la migration 0008) ;
    - géolocalisation : uniquement si le nom de localité extrait de l'URL
      Avito correspond exactement (normalisé) à une commune du référentiel
      officiel déjà en base (CommuneGeom) — aucun géocodage réseau, aucune
      coordonnée approximée. Mubawab n'a aucun champ de localité structuré
      dans l'export fourni : jamais géolocalisé par cette commande.

Usage:
    python manage.py import_scraped_data --source avito
    python manage.py import_scraped_data --source mubawab
    python manage.py import_scraped_data --source all
    python manage.py import_scraped_data --source avito --file /chemin/vers/export.json
    python manage.py import_scraped_data --source all --max-photos 5
    python manage.py import_scraped_data --source all --skip-images
"""

import json
import unicodedata
from decimal import Decimal, InvalidOperation
from io import BytesIO
from pathlib import Path

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from annonces.api_views import MAX_PHOTO_OCTETS
from annonces.models import Annonce, Parcelle, Photo
from geo.models import CommuneGeom

DATA_DIR = Path(__file__).resolve().parent.parent.parent / 'data' / 'scraped'

DEFAULT_FILES = {
    'avito': DATA_DIR / 'annonces_avito_20260810_085604.json',
    'mubawab': DATA_DIR / 'annonces_mubawab_20260810_092104.json',
}

BOT_USERS = {
    'avito': {
        'email': 'scraper.avito@akal.ma',
        'nom': 'Import',
        'prenom': 'Avito',
    },
    'mubawab': {
        'email': 'scraper.mubawab@akal.ma',
        'nom': 'Import',
        'prenom': 'Mubawab',
    },
}

# Segment d'URL Avito juste après "/fr/" — souvent une localité, parfois un
# nom de route ("route_de_fes") ou un fourre-tout ("autre_secteur") qui ne
# matchera simplement aucune commune, ce qui est le comportement voulu
# (jamais de faux positif forcé).
def _ville_brute_depuis_url_avito(url: str) -> str | None:
    try:
        segment = url.split('/fr/', 1)[1].split('/', 1)[0]
    except IndexError:
        return None
    return segment.replace('_', ' ').replace('-', ' ').strip() or None


def _normaliser(texte: str) -> str:
    """Minuscule, sans accents, espaces normalisés — pour comparaison exacte
    insensible à la casse/accentuation, jamais de correspondance approchée."""
    sans_accents = unicodedata.normalize('NFKD', texte).encode('ascii', 'ignore').decode('ascii')
    return ' '.join(sans_accents.lower().split())


class Command(BaseCommand):
    help = (
        "Importe les annonces scrapées Avito/Mubawab (JSON) — idempotent, "
        "n'invente jamais de donnée absente, ne publie que ce qui satisfait "
        "réellement Annonce.can_publish()."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--source', choices=['avito', 'mubawab', 'all'], default='all',
            help="Source à importer (défaut: all).",
        )
        parser.add_argument(
            '--file', default=None,
            help="Chemin JSON explicite (remplace le fichier par défaut ; incompatible avec --source all).",
        )
        parser.add_argument(
            '--max-photos', type=int, default=3,
            help="Nombre maximum de photos téléchargées par annonce (défaut: 3).",
        )
        parser.add_argument(
            '--skip-images', action='store_true',
            help="N'essaie jamais de télécharger d'image (import plus rapide, annonces sans photo).",
        )
        parser.add_argument(
            '--force', action='store_true',
            help="Requis pour lancer cette commande sous akal.settings.prod (garde-fou go-live).",
        )

    def handle(self, *args, **options):
        # Garde-fou production (audit go-live du 2026-08-11) : rien n'empêche
        # techniquement de lancer cette commande contre la base de prod si on
        # y a accès, mais ce n'est jamais son usage prévu (données de test
        # local uniquement). Un import accidentel en prod ne serait de toute
        # façon jamais visible publiquement tant que AKAL_DATASET reste
        # 'simulated' (défaut, cf. dataset_actif()) — cette vérification est
        # une seconde ligne de défense explicite, pas la seule.
        if settings.SETTINGS_MODULE == 'akal.settings.prod' and not options['force']:
            raise CommandError(
                "Cette commande importe des données de test (Avito/Mubawab) — jamais destinée à la "
                "production. Relancez avec --force si c'est réellement intentionnel."
            )

        source_arg = options['source']
        if options['file'] and source_arg == 'all':
            raise CommandError("--file requiert --source avito ou --source mubawab (pas 'all').")

        sources = ['avito', 'mubawab'] if source_arg == 'all' else [source_arg]

        self._communes_normalisees = {
            _normaliser(c.nom_affichage): c for c in CommuneGeom.objects.all()
        }

        bilan_global = []
        for source in sources:
            fichier = Path(options['file']) if options['file'] else DEFAULT_FILES[source]
            bilan_global.append(self._importer_source(source, fichier, options))

        self.stdout.write(self.style.MIGRATE_HEADING('\n== Bilan global ==\n'))
        for b in bilan_global:
            self.stdout.write(
                f"{b['source']:>8} | lues: {b['lues']:>4} | importees: {b['importees']:>4} | "
                f"deja_importees: {b['deja_importees']:>4} | rejetees: {b['rejetees']:>4} | "
                f"publiees: {b['publiees']:>4} | geolocalisees: {b['geolocalisees']:>4} | "
                f"photos_ok: {b['photos_ok']:>4} | photos_echec: {b['photos_echec']:>4}"
            )
            if b['raisons_rejet']:
                for raison, n in b['raisons_rejet'].items():
                    self.stdout.write(f"           rejet [{raison}]: {n}")

    # ──────────────────────────────────────────────

    def _importer_source(self, source, fichier, options):
        self.stdout.write(self.style.MIGRATE_HEADING(f'\n== Import {source} ({fichier.name}) ==\n'))

        if not fichier.exists():
            raise CommandError(f"Fichier introuvable : {fichier}")

        with open(fichier, encoding='utf-8') as f:
            data = json.load(f)
        entrees = data.get('annonces', [])

        bot, _ = User.objects.get_or_create(
            email=BOT_USERS[source]['email'],
            defaults={
                'nom': BOT_USERS[source]['nom'],
                'prenom': BOT_USERS[source]['prenom'],
                'role': 'VENDEUR',
                'is_verified': True,
            },
        )

        bilan = {
            'source': source, 'lues': len(entrees), 'importees': 0,
            'deja_importees': 0, 'rejetees': 0, 'publiees': 0,
            'geolocalisees': 0, 'photos_ok': 0, 'photos_echec': 0,
            'raisons_rejet': {},
        }

        for entree in entrees:
            self._importer_entree(source, entree, bot, options, bilan)

        return bilan

    def _rejeter(self, bilan, raison):
        bilan['rejetees'] += 1
        bilan['raisons_rejet'][raison] = bilan['raisons_rejet'].get(raison, 0) + 1

    @transaction.atomic
    def _importer_entree(self, source, entree, bot, options, bilan):
        source_id = str(entree.get('id_annonce') or '').strip()
        if not source_id:
            self._rejeter(bilan, 'id_annonce absent')
            return

        if Annonce.objects.filter(source=source, source_id=source_id).exists():
            bilan['deja_importees'] += 1
            return

        titre = (entree.get('titre') or '').strip()
        if not titre:
            self._rejeter(bilan, 'titre absent')
            return
        titre = titre[:120]  # Annonce.titre = CharField(max_length=120)

        prix_dh = entree.get('prix_dh')
        if not prix_dh or prix_dh <= 0:
            self._rejeter(bilan, 'prix absent ou nul')
            return
        try:
            prix_mad = Decimal(str(prix_dh)).quantize(Decimal('0.01'))
        except InvalidOperation:
            self._rejeter(bilan, 'prix illisible')
            return

        surface_m2 = entree.get('surface_m2')
        if not surface_m2 or surface_m2 <= 0:
            self._rejeter(bilan, 'surface absente ou nulle')
            return
        surface_ha = (Decimal(str(surface_m2)) / Decimal('10000')).quantize(Decimal('0.01'))
        if surface_ha <= 0:
            # Arrondi à 0.00 ha (surface_m2 très petite, ex. < 50 m²) —
            # inexploitable pour Parcelle.surface_ha (DecimalField, pas de
            # zéro métier valide), rejeté plutôt que stocké à 0.
            self._rejeter(bilan, 'surface trop petite après conversion en ha')
            return

        commune_geom = None
        latitude = longitude = geom = None
        if source == 'avito':
            ville_brute = _ville_brute_depuis_url_avito(entree.get('url', ''))
            if ville_brute:
                commune_geom = self._communes_normalisees.get(_normaliser(ville_brute))
        if commune_geom is not None:
            from django.contrib.gis.geos import Point
            centroide = commune_geom.geom.centroid
            latitude, longitude = centroide.y, centroide.x
            geom = Point(longitude, latitude, srid=4326)
            bilan['geolocalisees'] += 1

        parcelle = Parcelle.objects.create(
            commune_geom=commune_geom,
            surface_ha=surface_ha,
            latitude=latitude,
            longitude=longitude,
            geom=geom,
            # statut_foncier/acces_eau/topographie/acces_routier : laissés
            # NULL, aucune source scrapée ne les documente (cf. docstring).
            metadata={
                'source': source,
                'categorie_source': entree.get('categorie'),
                'titre_foncier_source': entree.get('titre_foncier'),
                'date_scraping_source': entree.get('date_scraping'),
            },
        )

        description = (entree.get('description') or '').strip()
        annonce = Annonce.objects.create(
            parcelle=parcelle,
            proprietaire=bot,
            titre=titre,
            description=description,
            prix_mad=prix_mad,
            statut=Annonce.StatutAnnonce.BROUILLON,
            source=source,
            source_id=source_id,
            source_url=(entree.get('url') or '')[:500] or None,
        )

        if not options['skip_images']:
            self._importer_photos(entree.get('images') or [], annonce, options['max_photos'], bilan)

        peut_publier, _raisons = annonce.can_publish()
        if peut_publier:
            annonce.statut = Annonce.StatutAnnonce.EN_LIGNE
            annonce.date_publication = timezone.now()
            annonce.save(update_fields=['statut', 'date_publication'])
            bilan['publiees'] += 1

        bilan['importees'] += 1

    def _importer_photos(self, urls, annonce, max_photos, bilan):
        ordre = 0
        for url in urls[:max_photos]:
            try:
                reponse = requests.get(url, timeout=8)
                reponse.raise_for_status()
                contenu = reponse.content
                if len(contenu) > MAX_PHOTO_OCTETS:
                    bilan['photos_echec'] += 1
                    continue
                # Validation réelle du contenu (même garde-fou que l'upload
                # utilisateur, api_views.py::AnnonceUpdateAPIView) : jamais
                # confiance aveugle dans l'extension d'URL.
                from PIL import Image
                Image.open(BytesIO(contenu)).verify()
            except Exception:
                bilan['photos_echec'] += 1
                continue

            extension = url.split('?')[0].rsplit('.', 1)[-1][:5] or 'jpg'
            photo = Photo(annonce=annonce, ordre=ordre)
            photo.image.save(
                f"scraped_{annonce.source}_{annonce.source_id}_{ordre}.{extension}",
                ContentFile(contenu),
                save=True,
            )
            ordre += 1
            bilan['photos_ok'] += 1
