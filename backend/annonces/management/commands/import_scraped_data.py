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

Téléchargement des photos : requests.get() en premier (rapide, marche pour
la plupart des CDN). Repli navigateur headless (Playwright/Chromium) quand
ça échoue — nécessaire pour content.avito.ma, derrière un challenge JS
Cloudflare qui renvoie une page HTML de challenge à tout client qui n'exécute
pas de JS (curl, requests...) ; un vrai navigateur passe ce challenge
normalement (audit du 2026-08-13). Nécessite `playwright install chromium`
une fois après `pip install -r requirements.txt` (pas fait automatiquement
par pip). Si Playwright/Chromium est absent, le repli est simplement
désactivé pour le run (les photos Avito échouent, tout le reste continue).

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

        # État du repli navigateur headless (cf. _telecharger_via_navigateur) :
        # None = jamais tenté, False = tenté et indisponible (désactivé pour
        # le run), sinon l'instance Browser réutilisée pour toutes les photos.
        self._browser = None
        self._playwright_ctx = None

        try:
            bilan_global = []
            for source in sources:
                fichier = Path(options['file']) if options['file'] else DEFAULT_FILES[source]
                bilan_global.append(self._importer_source(source, fichier, options))
        finally:
            if self._browser:
                self._browser.close()
            if self._playwright_ctx:
                self._playwright_ctx.stop()

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
        # Annonce.prix_mad = DecimalField(max_digits=12, decimal_places=2) —
        # borne à 9 999 999 999.99. Une source scrapée peut porter un prix
        # aberrant (faute de saisie, doublon de chiffre côté annonceur) ; sans
        # ce garde-fou, la valeur passe la validation ci-dessus (elle est bien
        # > 0) puis fait planter tout le run sur un DataError Postgres au save
        # (constaté en local lors de l'import du 13/08 avec un id Mubawab à
        # 16 366 000 000 DH). Rejeté
        # proprement plutôt que tronqué — même principe que le reste : jamais
        # de valeur inventée/corrigée à la place de la source.
        if prix_mad >= Decimal('10000000000'):
            self._rejeter(bilan, 'prix hors limites (dépasse la capacité du champ)')
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
            contenu, extension = self._recuperer_octets_image(url)
            if contenu is None:
                bilan['photos_echec'] += 1
                continue

            photo = Photo(annonce=annonce, ordre=ordre)
            photo.image.save(
                f"scraped_{annonce.source}_{annonce.source_id}_{ordre}.{extension}",
                ContentFile(contenu),
                save=True,
            )
            ordre += 1
            bilan['photos_ok'] += 1

    def _recuperer_octets_image(self, url):
        """
        (octets, extension) de l'image à l'URL donnée, ou (None, None) si
        indisponible.

        Chemin rapide : requests.get() direct (marche pour la plupart des
        CDN, ex. Mubawab/CloudFront). Repli : navigateur headless (cf.
        _telecharger_via_navigateur) pour les CDN derrière un challenge JS
        (constaté sur content.avito.ma — Cloudflare répond avec une page de
        challenge HTML plutôt que l'image tant que le JS n'est pas exécuté ;
        un navigateur réel passe ce challenge normalement, cf. audit du
        2026-08-13 : image identique accessible via Playwright/Chromium).

        Toujours validé en vrai contenu image (PIL, même garde-fou que
        l'upload utilisateur) avant d'être retourné — jamais de confiance
        aveugle dans un status 200. L'extension vient du format réel détecté
        par PIL, jamais de l'URL : les URLs Avito n'ont pas d'extension de
        fichier (juste un id numérique), et url.rsplit('.', 1) tombait sur
        le point de "avito.ma" — fichiers stockés avec une "extension"
        invalide (ex. "ma/cl") et donc un Content-Type application/octet-stream
        au lieu de image/jpeg côté stockage (constaté et corrigé le 2026-08-13).
        """
        for tentative in (self._telecharger_direct, self._telecharger_via_navigateur):
            candidat = tentative(url)
            if candidat is None or len(candidat) > MAX_PHOTO_OCTETS:
                continue
            try:
                from PIL import Image
                img = Image.open(BytesIO(candidat))
                format_detecte = (img.format or 'JPEG').lower()
                img.verify()
            except Exception:
                continue
            extension = {'jpeg': 'jpg'}.get(format_detecte, format_detecte)[:5]
            return candidat, extension
        return None, None

    def _telecharger_direct(self, url):
        try:
            reponse = requests.get(url, timeout=8)
            reponse.raise_for_status()
            return reponse.content
        except Exception:
            return None

    def _telecharger_via_navigateur(self, url):
        """
        Repli navigateur (Playwright/Chromium), lancé une seule fois par
        exécution de la commande (self._browser, cf. handle()) et réutilisé
        pour toutes les photos — instancier un navigateur par photo serait
        beaucoup trop coûteux. Si Playwright n'est pas installé ou que le
        lancement échoue, désactivé silencieusement pour le reste du run
        (self._browser passe à False) : ce repli est un complément, jamais
        une dépendance dure de la commande.

        headless=False, volontairement : Cloudflare détecte spécifiquement
        Chromium en mode headless et sert le challenge JS au lieu de
        l'image (403) même quand le JS s'exécute correctement — testé et
        confirmé le 2026-08-13 (headless=True -> 403, headless=False -> 200
        sur la même URL). Ça exige un vrai display ; marche sur un poste de
        dev avec interface graphique (cas d'usage prévu, cf. garde-fou prod
        plus haut), pas sur un serveur headless sans Xvfb.
        """
        if self._browser is False:
            return None
        if self._browser is None:
            try:
                # Playwright sync API instancie une boucle asyncio dans ce
                # thread ; Django détecte alors (à tort, pour notre usage)
                # un contexte async et bloque les appels ORM synchrones
                # (SynchronousOnlyOperation) — y compris ceux qui suivent,
                # hors de Playwright, dans le reste de _importer_entree().
                # Échappatoire officielle Django pour ce cas exact.
                import os
                os.environ.setdefault('DJANGO_ALLOW_ASYNC_UNSAFE', 'true')
                from playwright.sync_api import sync_playwright
                self._playwright_ctx = sync_playwright().start()
                self._browser = self._playwright_ctx.chromium.launch(headless=False)
            except Exception as exc:
                self.stderr.write(self.style.WARNING(
                    f"Playwright indisponible ({exc}) — repli navigateur désactivé pour ce run."
                ))
                self._browser = False
                return None

        page = None
        try:
            page = self._browser.new_page()
            reponse = page.goto(url, timeout=15000)
            if reponse is None or not reponse.ok:
                return None
            return reponse.body()
        except Exception:
            return None
        finally:
            if page is not None:
                page.close()
