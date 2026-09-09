"""
Tests de l'app annonces — F03 (dépôt d'annonce, upload photo MinIO).

Authentification réelle (signup + cookies), pas force_authenticate() : couvre
aussi le garde-fou CSRF (double-submit cookie/header), comme accounts/tests.py.
"""

import io
from datetime import timedelta
from decimal import Decimal

from django.contrib import admin
from django.contrib.auth.models import Group
from django.contrib.gis.geos import MultiPolygon, Point, Polygon
from django.contrib.messages.storage.fallback import FallbackStorage
from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import RequestFactory, SimpleTestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.models import User
from geo.models import Commune, CommuneGeom, Province, ProvinceGeom, Region, RegionOfficielle
from messaging.models import Conversation, Favori, Message, Notification
from . import transitions
from .admin import publier_selection, rejeter_selection
from .alertes import notifier_recherches_correspondantes
from .models import Annonce, Parcelle, Photo, RechercheSauvegardee, StatistiqueAnnonce
from .serializers import AnnonceDetailSerializer, _message_whatsapp, _numero_whatsapp

ANNONCES_URL = '/api/annonces/'


def image_jpeg(nom='photo.jpg', taille=(64, 64), octets_supplementaires=0):
    """
    JPEG valide en mémoire. `octets_supplementaires` gonfle la taille réelle
    du fichier (bytes ajoutés après les données JPEG) pour tester le rejet
    >2 Mo côté serveur sans générer une vraie image géante.
    """
    buf = io.BytesIO()
    Image.new('RGB', taille, color='green').save(buf, format='JPEG')
    if octets_supplementaires:
        buf.write(b'0' * octets_supplementaires)
    return SimpleUploadedFile(nom, buf.getvalue(), content_type='image/jpeg')


def _polygone_carre(centre_lon, centre_lat, demi_cote=0.1):
    """Petit carré MultiPolygon srid=4326 autour d'un centre — fixture de
    test, pas une vraie frontière administrative."""
    x0, y0 = centre_lon - demi_cote, centre_lat - demi_cote
    x1, y1 = centre_lon + demi_cote, centre_lat + demi_cote
    return MultiPolygon(Polygon(((x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0))), srid=4326)


class AnnoncesTestBase(APITestCase):
    def setUp(self):
        # De nombreux tests de ce module créent un utilisateur via
        # self.authentifier() (vrai POST /api/auth/signup/) — sans ce reset,
        # le scope 'signup' (5/hour, throttle go-live du 2026-08-10) est vite
        # dépassé par le cumul des tests du fichier, jamais par un seul test
        # isolément. Même précaution que accounts.tests.AuthTestCase pour
        # 'login'.
        cache.clear()
        self.client = APIClient(enforce_csrf_checks=True)
        self.region = Region.objects.create(id=1, code='fes-meknes', nom='Fès-Meknès')
        self.province = Province.objects.create(id=1, region=self.region, code='MEK', nom='Meknès')
        self.commune = Commune.objects.create(id=1, province=self.province, nom='Meknès Ville')

        # Référentiel géométrique officiel (2026-08-06) — is_geolocated()/
        # can_publish() se basent désormais sur commune_geom, pas sur
        # l'ancien `commune` ci-dessus (toujours créé, gardé pour les tests
        # qui portent spécifiquement sur la compatibilité legacy).
        self.region_officielle = RegionOfficielle.objects.create(
            code=3, slug='fes-meknes', nom='Fès-Meknès',
        )
        self.province_geom = ProvinceGeom.objects.create(
            iso='MA-03-131', nom='Meknès', region=self.region_officielle,
            geom=_polygone_carre(-5.5, 33.5),
        )
        self.commune_geom = CommuneGeom.objects.create(
            source_fid=1, libelle='MU MEKNES VILLE', nom_affichage='Meknès Ville',
            type_commune='MU', province=self.province_geom,
            geom=_polygone_carre(-5.5, 33.5, demi_cote=0.05),
        )

    def csrf_headers(self):
        # Pas de cookie csrftoken tant qu'aucune requête (même anonyme, ex.
        # signup) n'a été faite : {} plutôt qu'un KeyError, pour les tests
        # qui vérifient volontairement un rejet avant toute authentification.
        token = self.client.cookies.get('csrftoken')
        return {'HTTP_X_CSRFTOKEN': token.value} if token else {}

    def authentifier(self, email='vendeur@akal.ma'):
        """Crée un compte et authentifie self.client via de vrais cookies (pas force_authenticate)."""
        payload = {
            'email': email, 'password': 'un-mot-de-passe-solide-2026',
            'nom': 'Test', 'prenom': 'User',
        }
        response = self.client.post('/api/auth/signup/', payload)
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return User.objects.get(email=email)

    def payload_brouillon(self, **overrides):
        payload = {
            'titre': 'Belle parcelle agricole',
            'description': 'Une description suffisamment longue pour être valide.',
            'prix_mad': 150000,
            'parcelle': {
                'surface_ha': 2.5, 'statut_foncier': 'melkia', 'acces_eau': 'irriguee',
                'topographie': 'plat', 'acces_routier': 'goudron',
            },
        }
        payload.update(overrides)
        return payload

    def creer_brouillon(self, **overrides):
        return self.client.post(
            ANNONCES_URL, self.payload_brouillon(**overrides), format='json', **self.csrf_headers(),
        )

    def localiser(self, annonce_id):
        return self.client.patch(
            f'{ANNONCES_URL}{annonce_id}/',
            {'parcelle': {
                'commune': self.commune.id, 'commune_geom': self.commune_geom.id,
                'latitude': 33.5, 'longitude': -5.5,
            }},
            format='json', **self.csrf_headers(),
        )


class CreationBrouillonTests(AnnoncesTestBase):
    def test_creation_refusee_si_non_authentifie(self):
        response = self.creer_brouillon()

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_creation_force_statut_brouillon_meme_si_client_demande_autre_chose(self):
        self.authentifier()

        response = self.creer_brouillon(statut='en_ligne')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['statut'], 'brouillon')
        self.assertEqual(Annonce.objects.get(id=response.data['id']).statut, Annonce.StatutAnnonce.BROUILLON)

    def test_creation_promeut_automatiquement_le_role_vendeur(self):
        user = self.authentifier()
        self.assertEqual(user.role, '')

        self.creer_brouillon()

        user.refresh_from_db()
        self.assertEqual(user.role, User.Role.VENDEUR)


class PatchProprietaireTests(AnnoncesTestBase):
    def setUp(self):
        super().setUp()
        self.authentifier()
        self.annonce_id = self.creer_brouillon().data['id']

    def test_proprietaire_peut_patcher_son_brouillon(self):
        response = self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'titre': 'Titre modifié'},
            format='json', **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['titre'], 'Titre modifié')

    def test_autre_utilisateur_recoit_404_pas_403(self):
        # 404 et non 403 : le queryset est scopé au propriétaire, l'annonce
        # d'autrui n'existe tout simplement pas de son point de vue.
        self.client.logout()
        self.authentifier(email='intrus@akal.ma')

        response = self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'titre': 'Piraté'},
            format='json', **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_anonyme_recoit_401(self):
        self.client.logout()

        response = self.client.patch(f'{ANNONCES_URL}{self.annonce_id}/', {'titre': 'X'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_put_non_autorise(self):
        # http_method_names restreint volontairement PUT — seul PATCH est
        # dans le contrat F03 (édition partielle).
        response = self.client.put(
            f'{ANNONCES_URL}{self.annonce_id}/', self.payload_brouillon(),
            format='json', **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_localisation_construit_la_geometrie(self):
        response = self.localiser(self.annonce_id)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        annonce = Annonce.objects.get(id=self.annonce_id)
        self.assertTrue(annonce.parcelle.is_geolocated())


class ContourPolygoneTests(AnnoncesTestBase):
    """Dessin de parcelle, mode Polygone (2026-08-05) — DonneesGeo.contour."""

    # Rectangle simple, non auto-intersecté.
    RECTANGLE = [
        {'latitude': 33.50, 'longitude': -5.50},
        {'latitude': 33.50, 'longitude': -5.49},
        {'latitude': 33.51, 'longitude': -5.49},
        {'latitude': 33.51, 'longitude': -5.50},
    ]

    # Mêmes 4 coins que RECTANGLE mais C/D permutés : les diagonales se
    # croisent ("nœud papillon") — cas classique de polygone invalide.
    NOEUD_PAPILLON = [
        {'latitude': 33.50, 'longitude': -5.50},
        {'latitude': 33.50, 'longitude': -5.49},
        {'latitude': 33.51, 'longitude': -5.50},
        {'latitude': 33.51, 'longitude': -5.49},
    ]

    def setUp(self):
        super().setUp()
        self.authentifier()
        self.annonce_id = self.creer_brouillon().data['id']

    def dessiner(self, contour):
        return self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'parcelle': {'contour': contour}},
            format='json', **self.csrf_headers(),
        )

    def test_polygone_valide_cree_donnees_geo(self):
        response = self.dessiner(self.RECTANGLE)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        annonce = Annonce.objects.get(id=self.annonce_id)
        self.assertTrue(hasattr(annonce.parcelle, 'donnees_geo'))
        self.assertEqual(annonce.parcelle.donnees_geo.contour.num_points, 5)  # anneau fermé

    def test_contour_renvoye_sans_le_sommet_de_fermeture(self):
        response = self.dessiner(self.RECTANGLE)

        self.assertEqual(len(response.data['parcelle']['contour']), 4)

    def test_contour_jamais_expose_sur_la_fiche_publique(self):
        # Même logique de confidentialité que la position exacte (§4.4) :
        # le contour dessiné par le vendeur n'est lisible que via le PATCH
        # propriétaire (ParcelleEcritureSerializer) — jamais sur la fiche
        # publique (ParcelleDetailSerializer, dont Meta.fields omet `contour`).
        self.dessiner(self.RECTANGLE)
        # is_geolocated() exige aussi commune_geom (référentiel officiel,
        # 2026-08-06) — non couvert par dessiner(), cf.
        # test_centroide_derive_le_point_si_aucun_point_manuel ci-dessus.
        self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'parcelle': {'commune_geom': self.commune_geom.id}},
            format='json', **self.csrf_headers(),
        )
        self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'photos[]': [image_jpeg()]},
            format='multipart', **self.csrf_headers(),
        )
        self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'statut': 'en_ligne'},
            format='json', **self.csrf_headers(),
        )
        slug = Annonce.objects.get(id=self.annonce_id).slug

        response = self.client.get(f'{ANNONCES_URL}{slug}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('contour', response.data['parcelle'])

    def test_moins_de_3_sommets_distincts_rejete(self):
        response = self.dessiner(self.RECTANGLE[:2])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('contour', response.data['parcelle'])

    def test_sommets_dupliques_comptes_comme_un_seul(self):
        # 3 points transmis mais 2 identiques -> seulement 2 sommets distincts.
        response = self.dessiner([self.RECTANGLE[0], self.RECTANGLE[0], self.RECTANGLE[1]])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_polygone_auto_intersecte_rejete_sans_reparation_automatique(self):
        # Rejet strict (pas de make_valid()/buffer(0)) — décision du 2026-08-05.
        response = self.dessiner(self.NOEUD_PAPILLON)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('invalide', response.data['parcelle']['contour'][0].lower())
        annonce = Annonce.objects.get(id=self.annonce_id)
        self.assertFalse(hasattr(annonce.parcelle, 'donnees_geo'))

    def test_centroide_derive_le_point_si_aucun_point_manuel(self):
        response = self.dessiner(self.RECTANGLE)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        annonce = Annonce.objects.get(id=self.annonce_id)
        self.assertAlmostEqual(annonce.parcelle.latitude, 33.505, places=3)
        self.assertAlmostEqual(annonce.parcelle.longitude, -5.495, places=3)
        # is_geolocated() exige aussi commune_geom (référentiel officiel,
        # 2026-08-06) — non couvert par dessiner(), on le pose ici pour
        # vérifier le parcours complet mode Polygone (contour + commune,
        # sans point manuel).
        self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'parcelle': {'commune_geom': self.commune_geom.id}},
            format='json', **self.csrf_headers(),
        )
        annonce.parcelle.refresh_from_db()
        self.assertTrue(annonce.parcelle.is_geolocated())

    def test_point_manuel_jamais_ecrase_par_le_centroide(self):
        self.localiser(self.annonce_id)  # pose latitude=33.5, longitude=-5.5 manuellement

        response = self.dessiner(self.RECTANGLE)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        annonce = Annonce.objects.get(id=self.annonce_id)
        self.assertEqual(annonce.parcelle.latitude, 33.5)
        self.assertEqual(annonce.parcelle.longitude, -5.5)

    def test_contour_vide_repasse_en_mode_point_et_retire_le_contour(self):
        self.dessiner(self.RECTANGLE)

        response = self.dessiner([])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        annonce = Annonce.objects.get(id=self.annonce_id)
        self.assertFalse(hasattr(annonce.parcelle, 'donnees_geo'))
        self.assertIsNone(response.data['parcelle']['contour'])

    def test_champ_contour_absent_ne_touche_pas_au_contour_existant(self):
        self.dessiner(self.RECTANGLE)

        response = self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'titre': 'Autre titre'},
            format='json', **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        annonce = Annonce.objects.get(id=self.annonce_id)
        self.assertTrue(hasattr(annonce.parcelle, 'donnees_geo'))

    def test_creation_avec_contour_directement_au_post(self):
        response = self.creer_brouillon(parcelle={
            'surface_ha': 2.5, 'statut_foncier': 'melkia', 'acces_eau': 'irriguee',
            'topographie': 'plat', 'acces_routier': 'goudron',
            'contour': self.RECTANGLE,
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        annonce = Annonce.objects.get(id=response.data['id'])
        self.assertTrue(hasattr(annonce.parcelle, 'donnees_geo'))


class CommuneGeomTests(AnnoncesTestBase):
    """
    Référentiel géométrique officiel (2026-08-06) : is_geolocated()/
    can_publish() se basent sur commune_geom, pas sur l'ancien `commune` —
    et la lecture publique (région/province/commune affichées) doit
    fonctionner pour les deux chaînes, jamais casser sur l'une des deux.
    """

    def setUp(self):
        super().setUp()
        self.authentifier()
        self.annonce_id = self.creer_brouillon().data['id']

    def patch_parcelle(self, **champs):
        return self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'parcelle': champs},
            format='json', **self.csrf_headers(),
        )

    def test_commune_legacy_seule_ne_suffit_pas_a_geolocaliser(self):
        self.patch_parcelle(commune=self.commune.id, latitude=33.5, longitude=-5.5)

        annonce = Annonce.objects.get(id=self.annonce_id)
        self.assertFalse(annonce.parcelle.is_geolocated())

    def test_commune_geom_sans_commune_legacy_suffit_a_geolocaliser(self):
        self.patch_parcelle(commune_geom=self.commune_geom.id, latitude=33.5, longitude=-5.5)

        annonce = Annonce.objects.get(id=self.annonce_id)
        self.assertTrue(annonce.parcelle.is_geolocated())
        self.assertIsNone(annonce.parcelle.commune_id)  # jamais rétro-rempli

    def test_fiche_publique_affiche_region_province_commune_via_commune_geom(self):
        self.patch_parcelle(commune_geom=self.commune_geom.id, latitude=33.5, longitude=-5.5)
        self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'photos[]': [image_jpeg()]},
            format='multipart', **self.csrf_headers(),
        )
        self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'statut': 'en_ligne'},
            format='json', **self.csrf_headers(),
        )

        annonce = Annonce.objects.get(id=self.annonce_id)
        response = self.client.get(f'{ANNONCES_URL}{annonce.slug}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        parcelle = response.data['parcelle']
        self.assertEqual(parcelle['region']['code'], 'fes-meknes')  # slug, jamais le code HCP numérique
        self.assertEqual(parcelle['province'], 'Meknès')
        self.assertEqual(parcelle['commune'], 'Meknès Ville')

    def test_filtre_region_catalogue_matche_commune_geom(self):
        self.patch_parcelle(commune_geom=self.commune_geom.id, latitude=33.5, longitude=-5.5)
        self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'photos[]': [image_jpeg()]},
            format='multipart', **self.csrf_headers(),
        )
        self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'statut': 'en_ligne'},
            format='json', **self.csrf_headers(),
        )
        self.client.logout()

        response = self.client.get(ANNONCES_URL, {'region': 'fes-meknes'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(str(self.annonce_id), [a['id'] for a in response.data['results']])

    def publier_annonce_geolocalisee(self):
        """Localise (commune_geom), ajoute une photo et publie self.annonce_id — préalable
        commun aux tests de filtre province/commune ci-dessous."""
        self.patch_parcelle(commune_geom=self.commune_geom.id, latitude=33.5, longitude=-5.5)
        self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'photos[]': [image_jpeg()]},
            format='multipart', **self.csrf_headers(),
        )
        self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'statut': 'en_ligne'},
            format='json', **self.csrf_headers(),
        )
        self.client.logout()

    def test_filtre_province_catalogue_p0_04(self):
        """?province=<id ProvinceGeom> (cascade P0-04) — filtre sur commune_geom
        uniquement, jamais sur la province legacy (self.province, id potentiellement
        identique à self.province_geom.id sans être le même lieu, cf. commentaire
        AnnonceAPIFilter.province)."""
        self.publier_annonce_geolocalisee()

        response = self.client.get(ANNONCES_URL, {'province': self.province_geom.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(str(self.annonce_id), [a['id'] for a in response.data['results']])

    def test_filtre_province_catalogue_exclut_une_autre_province(self):
        self.publier_annonce_geolocalisee()
        autre_province = ProvinceGeom.objects.create(
            iso='MA-03-999', nom='Autre province', region=self.region_officielle,
            geom=_polygone_carre(-6.5, 34.5),
        )

        response = self.client.get(ANNONCES_URL, {'province': autre_province.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(self.annonce_id), [a['id'] for a in response.data['results']])

    def test_filtre_commune_catalogue_p0_04(self):
        """?commune=<id CommuneGeom> (cascade P0-04)."""
        self.publier_annonce_geolocalisee()

        response = self.client.get(ANNONCES_URL, {'commune': self.commune_geom.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(str(self.annonce_id), [a['id'] for a in response.data['results']])

    def test_filtre_commune_catalogue_exclut_une_autre_commune(self):
        self.publier_annonce_geolocalisee()
        autre_commune = CommuneGeom.objects.create(
            source_fid=999, libelle='CR AUTRE', nom_affichage='Autre commune',
            province=self.province_geom, geom=_polygone_carre(-5.5, 33.5, demi_cote=0.01),
        )

        response = self.client.get(ANNONCES_URL, {'commune': autre_commune.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(self.annonce_id), [a['id'] for a in response.data['results']])

    def test_filtre_bbox_carte_inclut_annonce_dans_la_zone(self):
        """?lat_min=/lat_max=/lng_min=/lng_max= ("Rechercher cette zone",
        2026-08-17) — self.annonce_id est publiée à (33.5, -5.5), cf.
        publier_annonce_geolocalisee()."""
        self.publier_annonce_geolocalisee()

        response = self.client.get(ANNONCES_URL, {
            'lat_min': 33.0, 'lat_max': 34.0, 'lng_min': -6.0, 'lng_max': -5.0,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(str(self.annonce_id), [a['id'] for a in response.data['results']])

    def test_filtre_bbox_carte_exclut_annonce_hors_zone(self):
        self.publier_annonce_geolocalisee()

        response = self.client.get(ANNONCES_URL, {
            # Une zone au sud, ne recouvrant pas (33.5, -5.5).
            'lat_min': 20.0, 'lat_max': 21.0, 'lng_min': -17.0, 'lng_max': -16.0,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(self.annonce_id), [a['id'] for a in response.data['results']])


class PhotoUploadTests(AnnoncesTestBase):
    def setUp(self):
        super().setUp()
        self.authentifier()
        self.annonce_id = self.creer_brouillon().data['id']

    def uploader(self, fichiers):
        return self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'photos[]': fichiers},
            format='multipart', **self.csrf_headers(),
        )

    def test_upload_photo_valide(self):
        response = self.uploader([image_jpeg()])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['photos']), 1)
        self.assertEqual(response.data['photos'][0]['ordre'], 0)

    def test_photo_trop_lourde_rejetee(self):
        grosse_photo = image_jpeg(octets_supplementaires=3 * 1024 * 1024)

        response = self.uploader([grosse_photo])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Photo.objects.filter(annonce_id=self.annonce_id).count(), 0)

    def test_fichier_non_image_rejete(self):
        faux_fichier = SimpleUploadedFile('doc.pdf', b'%PDF-1.4 pas une image', content_type='application/pdf')

        response = self.uploader([faux_fichier])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Photo.objects.filter(annonce_id=self.annonce_id).count(), 0)

    def test_ordre_sequentiel_sur_plusieurs_lots(self):
        self.uploader([image_jpeg('a.jpg'), image_jpeg('b.jpg')])

        response = self.uploader([image_jpeg('c.jpg')])

        ordres = sorted(p['ordre'] for p in response.data['photos'])
        self.assertEqual(ordres, [0, 1, 2])

    def test_limite_dix_photos_par_annonce(self):
        self.uploader([image_jpeg(f'{i}.jpg') for i in range(10)])

        response = self.uploader([image_jpeg('onzieme.jpg')])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Photo.objects.filter(annonce_id=self.annonce_id).count(), 10)


class PublicationTests(AnnoncesTestBase):
    def setUp(self):
        super().setUp()
        self.authentifier()
        self.annonce_id = self.creer_brouillon().data['id']

    def publier(self):
        return self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'statut': 'en_ligne'},
            format='json', **self.csrf_headers(),
        )

    def uploader_une_photo(self):
        return self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'photos[]': [image_jpeg()]},
            format='multipart', **self.csrf_headers(),
        )

    def test_publication_bloquee_avec_toutes_les_raisons_simultanement(self):
        # Régression : la garde brouillon->en_ligne comparait autrefois
        # instance.statut à EN_LIGNE *après* que validated_data l'ait déjà
        # écrasé dans la même méthode, donc can_publish() n'était jamais
        # appelé et une annonce vide pouvait passer en_ligne sans contrôle.
        response = self.publier()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(len(response.data['statut']), 2)  # géoloc + photo manquantes
        annonce = Annonce.objects.get(id=self.annonce_id)
        self.assertEqual(annonce.statut, Annonce.StatutAnnonce.BROUILLON)

    def test_prix_zero_refuse_des_l_ecriture(self):
        # Depuis les garde-fous de plausibilité (serializers.py) : un prix nul
        # ou négatif est refusé au PATCH lui-même, plus seulement à la
        # publication. can_publish() garde sa vérification prix > 0 comme
        # filet pour les écritures hors API (shell, script).
        self.localiser(self.annonce_id)
        self.uploader_une_photo()

        response = self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'prix_mad': 0}, format='json', **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('prix_mad', response.data)
        # Le prix d'origine (payload_brouillon) est intact, l'annonce reste brouillon.
        annonce = Annonce.objects.get(id=self.annonce_id)
        self.assertEqual(annonce.prix_mad, Decimal('150000.00'))
        self.assertEqual(annonce.statut, Annonce.StatutAnnonce.BROUILLON)

    def test_publication_reussie_definit_date_publication_et_apparait_publiquement(self):
        self.localiser(self.annonce_id)
        self.uploader_une_photo()

        response = self.publier()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['statut'], 'en_ligne')
        annonce = Annonce.objects.get(id=self.annonce_id)
        self.assertIsNotNone(annonce.date_publication)

        self.client.logout()
        liste = self.client.get(ANNONCES_URL)
        ids = [a['id'] for a in liste.data['results']]
        self.assertIn(self.annonce_id, ids)

    def test_brouillon_absent_de_la_liste_publique_avant_publication(self):
        self.client.logout()

        liste = self.client.get(ANNONCES_URL)

        ids = [a['id'] for a in liste.data['results']]
        self.assertNotIn(self.annonce_id, ids)

    def test_proprietaire_peut_modifier_le_contenu_dune_annonce_en_ligne(self):
        # Règle officialisée le 2026-07-29 (dashboard propriétaire, P1 #4) :
        # PATCH = édition de contenu, sans restriction de statut. Verrouille
        # ce comportement pour qu'il ne régresse pas silencieusement.
        self.localiser(self.annonce_id)
        self.uploader_une_photo()
        self.publier()

        response = self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'titre': 'Titre modifié après publication'},
            format='json', **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['titre'], 'Titre modifié après publication')
        annonce = Annonce.objects.get(id=self.annonce_id)
        self.assertEqual(annonce.statut, Annonce.StatutAnnonce.EN_LIGNE)

    def test_transition_vers_brouillon_toujours_bloquee_depuis_en_ligne(self):
        # Pendant que PATCH=contenu est désormais sans restriction (test
        # ci-dessus), le changement de STATUT reste, lui, strictement gouverné
        # par le graphe de transitions.py — en_ligne → archivee/vendue sont
        # devenues des arêtes valides avec le P2 (cf. TransitionsStatutTests),
        # mais en_ligne → brouillon n'en a jamais fait partie.
        self.localiser(self.annonce_id)
        self.uploader_une_photo()
        self.publier()

        response = self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'statut': 'brouillon'},
            format='json', **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        annonce = Annonce.objects.get(id=self.annonce_id)
        self.assertEqual(annonce.statut, Annonce.StatutAnnonce.EN_LIGNE)


class SuppressionPhotoTests(AnnoncesTestBase):
    def setUp(self):
        super().setUp()
        self.authentifier()
        self.annonce_id = self.creer_brouillon().data['id']
        response = self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/',
            {'photos[]': [image_jpeg('a.jpg'), image_jpeg('b.jpg'), image_jpeg('c.jpg')]},
            format='multipart', **self.csrf_headers(),
        )
        self.photos = sorted(response.data['photos'], key=lambda p: p['ordre'])

    def supprimer(self, photo_id):
        return self.client.delete(
            f'{ANNONCES_URL}{self.annonce_id}/photos/{photo_id}/', **self.csrf_headers(),
        )

    def test_suppression_reordonne_les_photos_restantes_sans_trou(self):
        response = self.supprimer(self.photos[0]['id'])  # supprime ordre=0

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        restantes = list(Photo.objects.filter(annonce_id=self.annonce_id).order_by('ordre'))
        self.assertEqual([p.ordre for p in restantes], [0, 1])
        self.assertEqual(str(restantes[0].id), self.photos[1]['id'])

    def test_suppression_refusee_pour_un_autre_utilisateur(self):
        self.client.logout()
        self.authentifier(email='intrus@akal.ma')

        response = self.supprimer(self.photos[0]['id'])

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(Photo.objects.filter(annonce_id=self.annonce_id).count(), 3)

    def test_suppression_refusee_une_fois_annonce_en_ligne(self):
        self.localiser(self.annonce_id)
        self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'statut': 'en_ligne'}, format='json', **self.csrf_headers(),
        )

        response = self.supprimer(self.photos[0]['id'])

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Photo.objects.filter(annonce_id=self.annonce_id).count(), 3)


class MesAnnoncesTests(AnnoncesTestBase):
    """GET /api/annonces/mes-annonces/ — dashboard propriétaire (tous statuts)."""

    def test_refuse_si_non_authentifie(self):
        response = self.client.get(f'{ANNONCES_URL}mes-annonces/')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_liste_les_annonces_du_proprietaire_quel_que_soit_le_statut(self):
        self.authentifier()
        brouillon_id = self.creer_brouillon(titre='Brouillon en cours').data['id']
        annonce_publiee_id = self.creer_brouillon(titre='Annonce publiée').data['id']
        self.localiser(annonce_publiee_id)
        self.client.patch(
            f'{ANNONCES_URL}{annonce_publiee_id}/', {'photos[]': [image_jpeg()]},
            format='multipart', **self.csrf_headers(),
        )
        self.client.patch(
            f'{ANNONCES_URL}{annonce_publiee_id}/', {'statut': 'en_ligne'},
            format='json', **self.csrf_headers(),
        )

        response = self.client.get(f'{ANNONCES_URL}mes-annonces/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [a['id'] for a in response.data]
        self.assertIn(brouillon_id, ids)
        self.assertIn(annonce_publiee_id, ids)
        statuts = {a['id']: a['statut'] for a in response.data}
        self.assertEqual(statuts[brouillon_id], 'brouillon')
        self.assertEqual(statuts[annonce_publiee_id], 'en_ligne')

    def test_n_inclut_pas_les_annonces_d_un_autre_proprietaire(self):
        self.authentifier(email='vendeur-a@akal.ma')
        annonce_a_id = self.creer_brouillon().data['id']

        self.client.logout()
        self.authentifier(email='vendeur-b@akal.ma')
        self.creer_brouillon(titre='Annonce du vendeur B')

        response = self.client.get(f'{ANNONCES_URL}mes-annonces/')

        ids = [a['id'] for a in response.data]
        self.assertNotIn(annonce_a_id, ids)
        self.assertEqual(len(response.data), 1)

    def test_nb_vues_par_annonce(self):
        # Chaque ligne porte le total cumulé de vues de sa fiche (somme
        # StatistiqueAnnonce, toutes dates). 0 pour une annonce jamais vue —
        # jamais null (Coalesce dans l'annotation de la vue).
        self.authentifier()
        vue_id = self.creer_brouillon(titre='Déjà consultée').data['id']
        jamais_vue_id = self.creer_brouillon(titre='Jamais consultée').data['id']
        annonce_vue = Annonce.objects.get(id=vue_id)
        StatistiqueAnnonce.objects.create(annonce=annonce_vue, date=timezone.localdate(), vues=8)
        StatistiqueAnnonce.objects.create(
            annonce=annonce_vue, date=timezone.localdate() - timedelta(days=2), vues=4,
        )

        response = self.client.get(f'{ANNONCES_URL}mes-annonces/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        nb_vues = {a['id']: a['nb_vues'] for a in response.data}
        self.assertEqual(nb_vues[vue_id], 12)
        self.assertEqual(nb_vues[jamais_vue_id], 0)


class EnregistrerVueTests(AnnoncesTestBase):
    """
    POST /api/annonces/<uuid:pk>/vue/ — beacon anonyme envoyé par la fiche
    (EnregistrerVueAPIView). Alimente StatistiqueAnnonce (compteur de vues
    par jour), dédupliqué 24 h par (annonce, IP+UA hashés, jour).
    """

    def setUp(self):
        super().setUp()
        # Le cache par défaut (vrai Redis) porte la déduplication et est
        # partagé entre tests — sans reset, une clé posée par un test ferait
        # « déjà vu » dans un autre. Même précaution que le cache de throttling.
        cache.clear()

    def _annonce_en_ligne(self, titre='Parcelle vue'):
        parcelle = Parcelle.objects.create(
            commune=self.commune, surface_ha=2.5, statut_foncier='melkia',
            acces_eau='irriguee', topographie='plat', acces_routier='goudron',
            latitude=33.5, longitude=-5.5,
        )
        return Annonce.objects.create(
            parcelle=parcelle, proprietaire=self.authentifier('proprio-vue@akal.ma'),
            titre=titre, description='Une description suffisamment longue.',
            prix_mad=150000, statut=Annonce.StatutAnnonce.EN_LIGNE,
        )

    def _url(self, annonce):
        return f'{ANNONCES_URL}{annonce.id}/vue/'

    def _vues_du_jour(self, annonce):
        stat = StatistiqueAnnonce.objects.filter(annonce=annonce, date=timezone.localdate()).first()
        return stat.vues if stat else 0

    def test_premiere_vue_incremente_le_compteur_du_jour(self):
        annonce = self._annonce_en_ligne()
        self.client.logout()

        response = self.client.post(self._url(annonce))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self._vues_du_jour(annonce), 1)

    def test_rafraichissements_successifs_ne_comptent_qu_une_fois(self):
        annonce = self._annonce_en_ligne()
        self.client.logout()

        for _ in range(5):
            self.assertEqual(
                self.client.post(self._url(annonce)).status_code, status.HTTP_204_NO_CONTENT,
            )

        # Même IP + même User-Agent + même jour → une seule vue comptée.
        self.assertEqual(self._vues_du_jour(annonce), 1)

    def test_deux_lecteurs_distincts_comptent_deux_fois(self):
        annonce = self._annonce_en_ligne()
        self.client.logout()

        self.client.post(self._url(annonce), HTTP_USER_AGENT='Navigateur A')
        self.client.post(self._url(annonce), HTTP_USER_AGENT='Navigateur B')

        self.assertEqual(self._vues_du_jour(annonce), 2)

    def test_annonce_inexistante_404(self):
        self.client.logout()
        response = self.client.post(f'{ANNONCES_URL}00000000-0000-0000-0000-000000000000/vue/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_brouillon_404_et_aucune_stat_creee(self):
        self.authentifier()
        brouillon_id = self.creer_brouillon().data['id']
        self.client.logout()

        response = self.client.post(f'{ANNONCES_URL}{brouillon_id}/vue/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(StatistiqueAnnonce.objects.filter(annonce_id=brouillon_id).exists())

    @override_settings(AKAL_DATASET='simulated')
    def test_annonce_hors_dataset_actif_404(self):
        annonce = self._annonce_en_ligne()
        annonce.source = Annonce.Source.AVITO
        annonce.save(update_fields=['source'])
        self.client.logout()

        response = self.client.post(self._url(annonce))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class MesStatistiquesTests(AnnoncesTestBase):
    """
    GET /api/annonces/mes-annonces/statistiques/ — favoris/conversations
    reçus, messages non lus (dashboard propriétaire). Les fixtures
    Favori/Conversation/Message sont créées directement en base (comme
    MessagingTestBase.creer_annonce) plutôt que via l'API : ce endpoint
    n'agrège que des compteurs, peu importe comment les lignes sont nées.

    `vues_totales` retiré de l'API le 2026-08-30 (compteur toujours nul,
    trompeur — cf. MesStatistiquesAPIView) : les tests de vues associés ont
    été supprimés avec le champ.
    """

    def setUp(self):
        super().setUp()
        # Plusieurs signup/login par test (vendeur + acheteur) : même
        # précaution que messaging/tests.py::MessagingTestBase contre le
        # throttle 'login' (5/min) partagé entre tests sur la même IP.
        cache.clear()

    def se_connecter(self, email):
        self.client.logout()
        self.client.post('/api/auth/login/', {'email': email, 'password': 'un-mot-de-passe-solide-2026'})

    def creer_annonce_en_ligne(self, proprietaire, titre='Belle parcelle'):
        parcelle = Parcelle.objects.create(
            commune=self.commune, surface_ha=2.5, statut_foncier='melkia',
            acces_eau='irriguee', topographie='plat', acces_routier='goudron',
            latitude=33.5, longitude=-5.5,
        )
        return Annonce.objects.create(
            parcelle=parcelle, proprietaire=proprietaire, titre=titre,
            description='Une description suffisamment longue.', prix_mad=150000,
            statut=Annonce.StatutAnnonce.EN_LIGNE,
        )

    def statistiques(self):
        return self.client.get(f'{ANNONCES_URL}mes-annonces/statistiques/')

    def test_refuse_si_non_authentifie(self):
        response = self.statistiques()

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_zero_partout_sans_activite_recue(self):
        vendeur = self.authentifier('vendeur@akal.ma')
        self.creer_annonce_en_ligne(vendeur)

        response = self.statistiques()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {
            'favoris_recus': 0, 'conversations_recues': 0, 'messages_non_lus': 0,
            'vues_totales': 0, 'vues_30j': 0,
        })

    def test_compte_les_favoris_recus_sur_ses_annonces(self):
        vendeur = self.authentifier('vendeur@akal.ma')
        annonce = self.creer_annonce_en_ligne(vendeur)
        acheteur = self.authentifier('acheteur@akal.ma')
        Favori.objects.create(user=acheteur, annonce=annonce)

        self.se_connecter('vendeur@akal.ma')
        response = self.statistiques()

        self.assertEqual(response.data['favoris_recus'], 1)

    def test_compte_les_conversations_recues_et_les_messages_non_lus(self):
        vendeur = self.authentifier('vendeur@akal.ma')
        annonce = self.creer_annonce_en_ligne(vendeur)
        acheteur = self.authentifier('acheteur@akal.ma')
        conversation = Conversation.objects.create(annonce=annonce, initiateur=acheteur)
        Message.objects.create(conversation=conversation, auteur=acheteur, contenu='Bonjour, toujours dispo ?')

        self.se_connecter('vendeur@akal.ma')
        response = self.statistiques()

        self.assertEqual(response.data['conversations_recues'], 1)
        self.assertEqual(response.data['messages_non_lus'], 1)

    def test_exclut_les_messages_du_proprietaire_lui_meme_du_compte_non_lus(self):
        vendeur = self.authentifier('vendeur@akal.ma')
        annonce = self.creer_annonce_en_ligne(vendeur)
        acheteur = self.authentifier('acheteur@akal.ma')
        conversation = Conversation.objects.create(annonce=annonce, initiateur=acheteur)

        self.se_connecter('vendeur@akal.ma')
        Message.objects.create(conversation=conversation, auteur=vendeur, contenu='Oui, toujours disponible.')
        response = self.statistiques()

        # Le message vient du propriétaire lui-même : jamais compté comme
        # "reçu", même s'il est is_lu=False (valeur par défaut du modèle).
        self.assertEqual(response.data['messages_non_lus'], 0)

    def test_ignore_les_messages_deja_lus(self):
        vendeur = self.authentifier('vendeur@akal.ma')
        annonce = self.creer_annonce_en_ligne(vendeur)
        acheteur = self.authentifier('acheteur@akal.ma')
        conversation = Conversation.objects.create(annonce=annonce, initiateur=acheteur)
        Message.objects.create(conversation=conversation, auteur=acheteur, contenu='Bonjour', is_lu=True)

        self.se_connecter('vendeur@akal.ma')
        response = self.statistiques()

        self.assertEqual(response.data['messages_non_lus'], 0)

    def test_n_inclut_pas_l_activite_recue_par_un_autre_proprietaire(self):
        vendeur_a = self.authentifier('vendeur-a@akal.ma')
        annonce_a = self.creer_annonce_en_ligne(vendeur_a)
        self.client.logout()
        vendeur_b = self.authentifier('vendeur-b@akal.ma')
        self.creer_annonce_en_ligne(vendeur_b, titre='Annonce du vendeur B')
        acheteur = self.authentifier('acheteur@akal.ma')
        Favori.objects.create(user=acheteur, annonce=annonce_a)
        conversation = Conversation.objects.create(annonce=annonce_a, initiateur=acheteur)
        Message.objects.create(conversation=conversation, auteur=acheteur, contenu='Bonjour')

        self.se_connecter('vendeur-b@akal.ma')
        response = self.statistiques()

        # Toute l'activité créée ci-dessus porte sur l'annonce du vendeur A,
        # pas du vendeur B connecté ici — rien ne doit lui être attribué.
        self.assertEqual(response.data, {
            'favoris_recus': 0, 'conversations_recues': 0, 'messages_non_lus': 0,
            'vues_totales': 0, 'vues_30j': 0,
        })

    def test_vues_de_fiche_agregees_totales_et_30j(self):
        # Rétabli le 2026-08-31 avec une collecte réelle : StatistiqueAnnonce
        # est désormais alimenté (EnregistrerVueAPIView). vues_totales = somme
        # toutes dates ; vues_30j = 30 derniers jours glissants.
        vendeur = self.authentifier('vendeur@akal.ma')
        a1 = self.creer_annonce_en_ligne(vendeur, titre='Parcelle A')
        a2 = self.creer_annonce_en_ligne(vendeur, titre='Parcelle B')
        aujourdhui = timezone.localdate()
        StatistiqueAnnonce.objects.create(annonce=a1, date=aujourdhui, vues=7)
        StatistiqueAnnonce.objects.create(annonce=a2, date=aujourdhui - timedelta(days=3), vues=5)
        # Hors fenêtre 30 j : compte dans le total, pas dans vues_30j.
        StatistiqueAnnonce.objects.create(annonce=a1, date=aujourdhui - timedelta(days=45), vues=100)

        self.se_connecter('vendeur@akal.ma')
        response = self.statistiques()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['vues_totales'], 112)
        self.assertEqual(response.data['vues_30j'], 12)

    def test_vues_n_inclut_pas_les_annonces_d_un_autre_proprietaire(self):
        vendeur_a = self.authentifier('vendeur-a@akal.ma')
        annonce_a = self.creer_annonce_en_ligne(vendeur_a)
        StatistiqueAnnonce.objects.create(annonce=annonce_a, date=timezone.localdate(), vues=9)
        self.client.logout()
        vendeur_b = self.authentifier('vendeur-b@akal.ma')
        self.creer_annonce_en_ligne(vendeur_b, titre='Annonce du vendeur B')

        self.se_connecter('vendeur-b@akal.ma')
        response = self.statistiques()

        self.assertEqual(response.data['vues_totales'], 0)
        self.assertEqual(response.data['vues_30j'], 0)


# ──────────────────────────────────────────────
# Throttling — annonce_create / photo_upload (audit go-live du 2026-08-10)
# ──────────────────────────────────────────────

class AnnonceCreateThrottleTests(AnnoncesTestBase):
    """POST /api/annonces/ — scope 'annonce_create' (20/hour)."""

    def setUp(self):
        super().setUp()
        self.authentifier()

    def test_throttled_after_twenty_creations(self):
        for _ in range(20):
            self.creer_brouillon()

        response = self.creer_brouillon()

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_throttle_isole_par_utilisateur(self):
        for _ in range(20):
            self.creer_brouillon()
        epuise = self.creer_brouillon()
        self.assertEqual(epuise.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # Un deuxième utilisateur n'a jamais consommé son propre quota.
        self.client.logout()
        self.authentifier(email='autre-vendeur@akal.ma')
        autre = self.creer_brouillon()
        self.assertNotEqual(autre.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class PhotoUploadThrottleTests(AnnoncesTestBase):
    """
    PATCH /api/annonces/<uuid>/ avec photos[] — scope 'photo_upload' (30/hour).

    Une seule annonce créée en setUp (pas une par tentative) : ça évite tout
    croisement avec le scope 'annonce_create' (20/hour) — MAX_PHOTOS_PAR_ANNONCE
    (10) sera dépassé en boucle et rejeté en 400 après la 10e, mais ça n'a
    aucune importance ici : le throttle compte la requête, jamais le résultat
    métier (même logique que SignupThrottleTests sur un email dupliqué).
    """

    def setUp(self):
        super().setUp()
        self.authentifier()
        self.annonce_id = self.creer_brouillon().data['id']

    def patcher_avec_photo(self):
        return self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'photos[]': [image_jpeg()]},
            format='multipart', **self.csrf_headers(),
        )

    def test_throttled_after_thirty_uploads(self):
        for _ in range(30):
            self.patcher_avec_photo()

        response = self.patcher_avec_photo()

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_edition_de_contenu_sans_photo_nest_jamais_comptee(self):
        # Le point d'attention explicite de ce lot : une édition de contenu
        # pure (titre, prix...) sur ce même endpoint ne doit JAMAIS consommer
        # le quota 'photo_upload', même largement au-delà de sa limite (30) —
        # seul un upload avec des photos réelles peut coûter du stockage.
        for _ in range(35):
            response = self.client.patch(
                f'{ANNONCES_URL}{self.annonce_id}/', {'titre': 'Titre modifié'},
                format='json', **self.csrf_headers(),
            )
            self.assertNotEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_throttle_isole_par_utilisateur(self):
        for _ in range(30):
            self.patcher_avec_photo()
        epuise = self.patcher_avec_photo()
        self.assertEqual(epuise.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # Un deuxième utilisateur, sur sa propre annonce, n'a jamais consommé
        # son propre quota.
        self.client.logout()
        self.authentifier(email='autre-vendeur-photo@akal.ma')
        autre_annonce_id = self.creer_brouillon().data['id']
        autre = self.client.patch(
            f'{ANNONCES_URL}{autre_annonce_id}/', {'photos[]': [image_jpeg()]},
            format='multipart', **self.csrf_headers(),
        )
        self.assertNotEqual(autre.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


# ──────────────────────────────────────────────
# Résilience Redis — le throttling ne doit jamais faire 500 (hardening 2026-08-31)
# ──────────────────────────────────────────────
#
# cf. docs/plans/2026-08-31-redis-fail-open.md. check_throttles() s'exécute
# dans initial(), AVANT le handler de vue (rest_framework/views.py) ; les
# throttles DRF lisent le cache par défaut dans allow_request(). Sans
# IGNORE_EXCEPTIONS (base.py), une panne Redis lève ConnectionInterrupted à
# cet endroit → 500 sur presque toute l'API, avant toute logique métier.
# Ce test verrouille le fail-open : Redis HS → le throttling laisse passer,
# jamais un 500. Même fixture que geo/tests.py::CacheLimitesGeoTests.
_CACHE_REDIS_MORT = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': 'redis://127.0.0.1:6399/0',  # port fermé = panne Redis
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            'IGNORE_EXCEPTIONS': True,  # réplique exacte de base.py
        },
        'KEY_PREFIX': 'akal-test-redis-mort',
    }
}


@override_settings(CACHES=_CACHE_REDIS_MORT)
class ResilienceRedisThrottlingTests(AnnoncesTestBase):
    """
    Panne Redis → le throttling DRF échoue « ouvert », jamais un 500.

    `django.core.cache.cache` (donc `SimpleRateThrottle.cache`) est un proxy
    ré-résolu à chaque accès : override_settings suffit à basculer les
    throttles sur le faux cache. `assertLogs` vérifie au passage que
    l'incident RESTE VISIBLE : django-redis logue chaque exception ignorée
    via `logger.exception` (niveau ERROR) sur `django_redis.cache` quand
    DJANGO_REDIS_LOG_IGNORED_EXCEPTIONS est vrai — donc console (Render) et,
    en prod, Sentry (LoggingIntegration event_level='ERROR').
    """

    def setUp(self):
        super().setUp()
        self.authentifier()

    def test_ecriture_throttlee_repond_malgre_redis_hs(self):
        # POST /api/annonces/ : UserRateThrottle + ScopedRateThrottle
        # ('annonce_create'), les deux lisent le cache dans allow_request().
        with self.assertLogs('django_redis.cache', level='ERROR'):
            response = self.creer_brouillon()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_lecture_publique_anonyme_repond_malgre_redis_hs(self):
        # Le catalogue public passe par AnonRateThrottle (plancher global
        # base.py) — c'est lui qui 500-erait toute la navigation anonyme.
        anon = APIClient()
        with self.assertLogs('django_redis.cache', level='ERROR'):
            response = anon.get(ANNONCES_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ──────────────────────────────────────────────
# Quota d'annonces actives (audit go-live du 2026-08-10)
# ──────────────────────────────────────────────

class AnnonceQuotaTests(AnnoncesTestBase):
    """
    POST /api/annonces/ — quota de 20 annonces actives (brouillon/en_attente/
    en_ligne) par propriétaire, complément du throttling 'annonce_create'.

    Les 20 annonces pré-existantes de chaque test sont créées directement en
    base (jamais via l'API) : ça isole complètement ce test du throttling
    'annonce_create' (20/hour, même chiffre par coïncidence — mélanger les
    deux via l'API rendrait ambigu lequel des deux mécanismes bloque la
    21e requête). Seule la requête réellement testée passe par l'API.
    """

    def setUp(self):
        super().setUp()
        self.vendeur = self.authentifier()

    def creer_annonces_en_base(self, n, statut):
        for i in range(n):
            parcelle = Parcelle.objects.create(
                surface_ha=2.5, statut_foncier='melkia', acces_eau='irriguee',
                topographie='plat', acces_routier='goudron',
            )
            Annonce.objects.create(
                parcelle=parcelle, proprietaire=self.vendeur, titre=f'Annonce quota {i}',
                description='Une description suffisamment longue pour être valide.',
                prix_mad=100000, statut=statut,
            )

    def test_refuse_la_creation_au_dela_de_la_limite(self):
        self.creer_annonces_en_base(20, Annonce.StatutAnnonce.BROUILLON)

        response = self.creer_brouillon()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_autorise_juste_sous_la_limite(self):
        self.creer_annonces_en_base(19, Annonce.StatutAnnonce.BROUILLON)

        response = self.creer_brouillon()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_en_attente_et_en_ligne_comptent_aussi(self):
        self.creer_annonces_en_base(10, Annonce.StatutAnnonce.EN_LIGNE)
        self.creer_annonces_en_base(10, Annonce.StatutAnnonce.EN_ATTENTE)

        response = self.creer_brouillon()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_les_annonces_archivees_ne_comptent_pas(self):
        self.creer_annonces_en_base(20, Annonce.StatutAnnonce.ARCHIVEE)

        response = self.creer_brouillon()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_les_annonces_vendues_ne_comptent_pas(self):
        self.creer_annonces_en_base(20, Annonce.StatutAnnonce.VENDUE)

        response = self.creer_brouillon()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_quota_isole_par_utilisateur(self):
        self.creer_annonces_en_base(20, Annonce.StatutAnnonce.BROUILLON)
        epuise = self.creer_brouillon()
        self.assertEqual(epuise.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.logout()
        self.authentifier(email='autre-vendeur-quota@akal.ma')
        autre = self.creer_brouillon()
        self.assertEqual(autre.status_code, status.HTTP_201_CREATED)


class TransitionsAutoriseesTests(SimpleTestCase):
    """Tests purs sur annonces/transitions.py — sans base de données."""

    def test_transitions_attendues_sont_autorisees(self):
        cas = [
            ('brouillon', 'en_ligne'),
            ('brouillon', 'en_attente'),
            ('en_attente', 'en_ligne'),
            ('en_attente', 'brouillon'),
            ('en_ligne', 'archivee'),
            ('en_ligne', 'vendue'),
            ('archivee', 'en_ligne'),
            ('vendue', 'en_ligne'),
        ]
        for depuis, vers in cas:
            with self.subTest(depuis=depuis, vers=vers):
                self.assertTrue(transitions.transition_autorisee(depuis, vers))

    def test_vendue_ne_peut_sortir_que_vers_en_ligne(self):
        # Remise en vente (2026-08-07) : vendue → en_ligne est la SEULE
        # arête sortante — brouillon/en_attente/archivee/vendue restent
        # bloqués, cf. docstring transitions.py.
        for cible in ('brouillon', 'en_attente', 'archivee', 'vendue'):
            with self.subTest(cible=cible):
                self.assertFalse(transitions.transition_autorisee('vendue', cible))
        self.assertTrue(transitions.transition_autorisee('vendue', 'en_ligne'))

    def test_archivee_vers_vendue_non_autorise_directement(self):
        # Doit d'abord repasser par en_ligne (réactivation) — cf. docstring
        # transitions.py.
        self.assertFalse(transitions.transition_autorisee('archivee', 'vendue'))

    def test_vendue_vers_archivee_non_autorise_directement(self):
        # Doit d'abord repasser par en_ligne (remise en vente) — cf.
        # docstring transitions.py, même logique que archivee → vendue.
        self.assertFalse(transitions.transition_autorisee('vendue', 'archivee'))


class TransitionsStatutTests(AnnoncesTestBase):
    """Vérifie le graphe P2 bout en bout via l'API (pas seulement transitions.py)."""

    def setUp(self):
        super().setUp()
        self.authentifier()
        self.annonce_id = self.creer_brouillon().data['id']
        self.localiser(self.annonce_id)
        self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'photos[]': [image_jpeg()]},
            format='multipart', **self.csrf_headers(),
        )
        self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'statut': 'en_ligne'},
            format='json', **self.csrf_headers(),
        )

    def _patch_statut(self, statut):
        return self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'statut': statut},
            format='json', **self.csrf_headers(),
        )

    def test_en_ligne_vers_archivee(self):
        response = self._patch_statut('archivee')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Annonce.objects.get(id=self.annonce_id).statut, Annonce.StatutAnnonce.ARCHIVEE)

    def test_en_ligne_vers_vendue_directement(self):
        response = self._patch_statut('vendue')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Annonce.objects.get(id=self.annonce_id).statut, Annonce.StatutAnnonce.VENDUE)

    def test_archivee_vers_en_ligne_reactivation_immediate(self):
        self._patch_statut('archivee')

        response = self._patch_statut('en_ligne')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Annonce.objects.get(id=self.annonce_id).statut, Annonce.StatutAnnonce.EN_LIGNE)

    def test_archivee_vers_vendue_rejete_sans_reactivation(self):
        self._patch_statut('archivee')

        response = self._patch_statut('vendue')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Annonce.objects.get(id=self.annonce_id).statut, Annonce.StatutAnnonce.ARCHIVEE)

    def test_vendue_vers_en_ligne_remise_en_vente(self):
        self._patch_statut('vendue')

        response = self._patch_statut('en_ligne')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Annonce.objects.get(id=self.annonce_id).statut, Annonce.StatutAnnonce.EN_LIGNE)

    def test_vendue_vers_archivee_rejete_sans_remise_en_vente(self):
        self._patch_statut('vendue')

        response = self._patch_statut('archivee')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Annonce.objects.get(id=self.annonce_id).statut, Annonce.StatutAnnonce.VENDUE)


# ══════════════════════════════════════════════════════════════
# IMPORT DE DONNÉES SCRAPÉES (2026-08-11)
# ══════════════════════════════════════════════════════════════
#
# `manage.py import_scraped_data` — jamais testé contre les gros fichiers
# réels de annonces/data/scraped/ (lent, dépend du réseau pour les photos) :
# des petits fichiers JSON isolés, écrits dans un répertoire temporaire,
# couvrent chaque comportement individuellement.

import json
import tempfile
from decimal import Decimal
from unittest.mock import Mock, patch

from django.core.management import CommandError, call_command
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings


def _fichier_json_temporaire(annonces):
    """Écrit `annonces` dans un fichier JSON temporaire au format attendu par
    la commande, retourne son chemin (str). Jamais nettoyé explicitement :
    tempfile choisit un répertoire que l'OS purge, pas besoin d'un tearDown
    dédié pour un fichier de quelques Ko par test."""
    fd = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8')
    json.dump({'annonces': annonces}, fd)
    fd.close()
    return fd.name


def _entree(id_annonce='1', titre='Terrain agricole à vendre', prix_dh=350000,
            surface_m2=5000, url='https://www.avito.ma/fr/autre_secteur/terrains_et_fermes/x.htm',
            images=None, **kwargs):
    """Une entrée JSON scrapée valide par défaut (prix + surface renseignés) —
    chaque test ne surcharge que le(s) champ(s) qui l'intéresse(nt)."""
    data = {
        'id_annonce': id_annonce, 'url': url, 'titre': titre,
        'description': 'Description de test.', 'prix_dh': prix_dh,
        'surface_m2': surface_m2, 'categorie': 'Agricole', 'titre_foncier': True,
        'images': images if images is not None else [],
        'date_scraping': '2026-08-10T08:00:00.000000',
    }
    data.update(kwargs)
    return data


class ImportScrapedDataTestBase(TestCase):
    def setUp(self):
        # Commune officielle nommée pour matcher le segment d'URL Avito
        # "/fr/meknes_ville/..." une fois normalisé (minuscules, sans
        # accents, underscores -> espaces) — même fixture géographique que
        # AnnoncesTestBase.setUp() ci-dessus, dupliquée ici pour ne pas
        # dépendre de APITestCase (inutilement lourd pour ces tests, aucune
        # requête HTTP n'est faite).
        region_officielle = RegionOfficielle.objects.create(code=3, slug='fes-meknes', nom='Fès-Meknès')
        province_geom = ProvinceGeom.objects.create(
            iso='MA-03-131', nom='Meknès', region=region_officielle,
            geom=_polygone_carre(-5.5, 33.5),
        )
        self.commune_geom = CommuneGeom.objects.create(
            source_fid=1, libelle='MU MEKNES VILLE', nom_affichage='Meknès Ville',
            type_commune='MU', province=province_geom,
            geom=_polygone_carre(-5.5, 33.5, demi_cote=0.05),
        )

    def importer(self, annonces, source='avito', **options):
        chemin = _fichier_json_temporaire(annonces)
        call_command('import_scraped_data', source=source, file=chemin, skip_images=True, **options)


class ImportAvitoTests(ImportScrapedDataTestBase):
    def test_import_avito_cree_une_annonce_source_avito(self):
        self.importer([_entree(id_annonce='111', titre='Terrain à Berrechid')])

        annonce = Annonce.objects.get(source='avito', source_id='111')
        self.assertEqual(annonce.titre, 'Terrain à Berrechid')
        self.assertEqual(annonce.statut, Annonce.StatutAnnonce.BROUILLON)  # pas de photo => jamais publiée
        self.assertEqual(annonce.proprietaire.email, 'scraper.avito@akal.ma')
        self.assertEqual(annonce.proprietaire.role, 'VENDEUR')

    def test_prix_et_surface_correctement_convertis(self):
        self.importer([_entree(id_annonce='112', prix_dh=420000, surface_m2=15000)])

        annonce = Annonce.objects.get(source_id='112')
        self.assertEqual(annonce.prix_mad, Decimal('420000.00'))
        self.assertEqual(annonce.parcelle.surface_ha, Decimal('1.50'))  # 15000 m² = 1.5 ha


class ImportMubawabTests(ImportScrapedDataTestBase):
    def test_import_mubawab_cree_une_annonce_source_mubawab(self):
        self.importer(
            [_entree(id_annonce='222', url='https://www.mubawab.ma/fr/a/222/terrain', titre='Terrain Mubawab')],
            source='mubawab',
        )

        annonce = Annonce.objects.get(source='mubawab', source_id='222')
        self.assertEqual(annonce.titre, 'Terrain Mubawab')
        self.assertEqual(annonce.proprietaire.email, 'scraper.mubawab@akal.ma')

    def test_mubawab_geolocalise_via_commune_nommee_dans_le_titre(self):
        """Contrairement à Avito (segment d'URL dédié), Mubawab n'a aucun
        champ structuré de localité dans l'export fourni — mais depuis le
        2026-08-18 (décision produit, cf. docstring import_scraped_data),
        le titre/la description sont passés au crible pour y reconnaître un
        nom de commune officielle, pour les deux sources."""
        self.importer(
            [_entree(
                id_annonce='223', source='mubawab',
                url='https://www.mubawab.ma/fr/a/223/terrain-a-meknes-ville',
                titre='Terrain agricole à Meknès Ville',  # la ville EST dans le titre
            )],
            source='mubawab',
        )

        parcelle = Annonce.objects.get(source_id='223').parcelle
        self.assertEqual(parcelle.commune_geom_id, self.commune_geom.pk)
        self.assertIsNotNone(parcelle.latitude)
        self.assertIsNotNone(parcelle.longitude)

    def test_mubawab_sans_aucun_lieu_reconnaissable_reste_non_geolocalisee(self):
        """Ni le titre ni la description ne nomment une commune ou une
        région connue — toujours aucune coordonnée inventée."""
        self.importer(
            [_entree(
                id_annonce='224', source='mubawab',
                url='https://www.mubawab.ma/fr/a/224/terrain-agricole',
                titre='Terrain agricole à vendre',
                description='Beau terrain, prix négociable.',
            )],
            source='mubawab',
        )

        parcelle = Annonce.objects.get(source_id='224').parcelle
        self.assertIsNone(parcelle.commune_geom)
        self.assertIsNone(parcelle.latitude)


class ImportIdempotenceTests(ImportScrapedDataTestBase):
    def test_deuxieme_execution_ne_duplique_rien(self):
        entrees = [_entree(id_annonce='301'), _entree(id_annonce='302')]

        self.importer(entrees)
        self.assertEqual(Annonce.objects.filter(source='avito').count(), 2)

        self.importer(entrees)  # relancée telle quelle

        self.assertEqual(Annonce.objects.filter(source='avito').count(), 2)  # toujours 2, pas 4

    def test_contrainte_unique_source_source_id_au_niveau_base(self):
        """Vérifie la contrainte DB elle-même (migration 0008), pas
        seulement le garde-fou applicatif de la commande."""
        parcelle = Parcelle.objects.create(surface_ha=Decimal('1.00'))
        bot = User.objects.create_user(email='bot@akal.ma', password='x', nom='B', prenom='O')
        Annonce.objects.create(
            parcelle=parcelle, proprietaire=bot, titre='A', description='',
            prix_mad=Decimal('1000.00'), source='avito', source_id='dup',
        )
        # transaction.atomic() indispensable ici : sans savepoint dédié,
        # l'IntegrityError laisse la transaction de test (par ailleurs
        # rollback-only, cf. TestCase) dans un état "aborted" côté Postgres —
        # toute requête suivante (dans ce test ou les suivants, tant que la
        # connexion n'est pas explicitement récupérée) échoue en cascade,
        # jusqu'au DROP DATABASE final du teardown ("database is being
        # accessed by other users"). Constaté en CI (job 94769774541) :
        # 100+ erreurs sans rapport, dans annonces/geo/messaging, toutes en
        # aval de ce seul test.
        with self.assertRaises(IntegrityError), transaction.atomic():
            Annonce.objects.create(
                parcelle=parcelle, proprietaire=bot, titre='B', description='',
                prix_mad=Decimal('2000.00'), source='avito', source_id='dup',
            )

    def test_annonces_internes_jamais_concernees_par_la_contrainte(self):
        """source='interne', source_id=NULL pour toutes — la contrainte est
        conditionnée à source_id IS NOT NULL (migration 0008) : deux
        annonces internes ne doivent jamais entrer en collision."""
        parcelle = Parcelle.objects.create(surface_ha=Decimal('1.00'))
        bot = User.objects.create_user(email='vendeur@akal.ma', password='x', nom='V', prenom='E')
        Annonce.objects.create(
            parcelle=parcelle, proprietaire=bot, titre='A', description='', prix_mad=Decimal('1000.00'),
        )
        Annonce.objects.create(  # ne doit lever aucune IntegrityError
            parcelle=parcelle, proprietaire=bot, titre='B', description='', prix_mad=Decimal('2000.00'),
        )
        self.assertEqual(Annonce.objects.filter(source='interne').count(), 2)


class ImportDonneesManquantesTests(ImportScrapedDataTestBase):
    def test_prix_absent_rejete_jamais_invente(self):
        self.importer([_entree(id_annonce='401', prix_dh=None)])

        self.assertFalse(Annonce.objects.filter(source_id='401').exists())

    def test_prix_nul_ou_negatif_rejete(self):
        self.importer([_entree(id_annonce='402', prix_dh=0)])

        self.assertFalse(Annonce.objects.filter(source_id='402').exists())

    def test_surface_absente_rejetee_jamais_inventee(self):
        self.importer([_entree(id_annonce='403', surface_m2=None)])

        self.assertFalse(Annonce.objects.filter(source_id='403').exists())

    def test_titre_absent_rejete(self):
        self.importer([_entree(id_annonce='404', titre='')])

        self.assertFalse(Annonce.objects.filter(source_id='404').exists())

    def test_entree_valide_dans_le_meme_lot_est_quand_meme_importee(self):
        """Une entrée rejetée ne doit jamais faire échouer l'import des
        autres entrées du même fichier (transaction par entrée, pas globale)."""
        self.importer([_entree(id_annonce='405', prix_dh=None), _entree(id_annonce='406')])

        self.assertFalse(Annonce.objects.filter(source_id='405').exists())
        self.assertTrue(Annonce.objects.filter(source_id='406').exists())

    def test_statut_foncier_et_qualites_terrain_jamais_inventes(self):
        """Aucune source scrapée ne documente statut_foncier/acces_eau/
        topographie/acces_routier — doivent rester NULL, jamais une valeur
        plausible mais fabriquée."""
        self.importer([_entree(id_annonce='407')])

        parcelle = Annonce.objects.get(source_id='407').parcelle
        self.assertIsNone(parcelle.statut_foncier)
        self.assertIsNone(parcelle.acces_eau)
        self.assertIsNone(parcelle.topographie)
        self.assertIsNone(parcelle.acces_routier)


class ImportSourceConserveeTests(ImportScrapedDataTestBase):
    def test_source_source_id_et_source_url_correctement_renseignes(self):
        self.importer([_entree(
            id_annonce='501', url='https://www.avito.ma/fr/berrechid/terrains_et_fermes/x_501.htm',
        )])

        annonce = Annonce.objects.get(source_id='501')
        self.assertEqual(annonce.source, 'avito')
        self.assertEqual(annonce.source_id, '501')
        self.assertEqual(annonce.source_url, 'https://www.avito.ma/fr/berrechid/terrains_et_fermes/x_501.htm')

    @override_settings(AKAL_DATASET='scraped')
    def test_source_exposee_en_lecture_par_lapi_publique(self):
        self.importer([_entree(id_annonce='502')])
        annonce = Annonce.objects.get(source_id='502')
        # Publiée manuellement ici (l'entrée de test n'a pas de photo, donc
        # jamais can_publish() côté commande) — seul le contrat du serializer
        # est vérifié, pas le workflow de publication (déjà couvert ailleurs).
        # AKAL_DATASET='scraped' : sans ça, dataset_actif() exclurait cette
        # annonce source=avito de la vue publique (comportement voulu,
        # vérifié séparément par DatasetActifTests) et le test obtiendrait
        # un 404 plutôt que la représentation attendue.
        annonce.statut = Annonce.StatutAnnonce.EN_LIGNE
        annonce.save()

        response = APIClient().get(f'{ANNONCES_URL}{annonce.slug}/')

        self.assertEqual(response.data['source'], 'avito')


class ImportGeolocalisationTests(ImportScrapedDataTestBase):
    def test_localite_avito_resolue_contre_le_referentiel_officiel(self):
        self.importer([_entree(
            id_annonce='601',
            url='https://www.avito.ma/fr/meknes_ville/terrains_et_fermes/x_601.htm',
        )])

        parcelle = Annonce.objects.get(source_id='601').parcelle
        self.assertEqual(parcelle.commune_geom_id, self.commune_geom.pk)
        self.assertIsNotNone(parcelle.latitude)
        self.assertIsNotNone(parcelle.longitude)
        self.assertIsNotNone(parcelle.geom)

    def test_localite_sans_correspondance_reste_non_geolocalisee(self):
        """"autre_secteur", "route_de_fes"... ne matchent aucune commune, et
        le titre/la description par défaut (_entree) ne nomment aucune
        commune ni région connue — jamais de coordonnée approximée par
        défaut, quel que soit le palier (commune ou région)."""
        self.importer([_entree(
            id_annonce='602',
            url='https://www.avito.ma/fr/autre_secteur/terrains_et_fermes/x_602.htm',
        )])

        parcelle = Annonce.objects.get(source_id='602').parcelle
        self.assertIsNone(parcelle.commune_geom)
        self.assertIsNone(parcelle.latitude)
        self.assertIsNone(parcelle.longitude)
        self.assertIsNone(parcelle.geom)
        self.assertFalse(parcelle.is_geolocated())

    def test_commune_reconnue_dans_le_titre_quand_lurl_ne_matche_pas(self):
        """L'URL Avito ("autre_secteur") ne donne rien, mais le titre nomme
        une commune du référentiel officiel — résolue tout de même (même
        palier de précision qu'une résolution par URL : commune_geom
        renseigné)."""
        self.importer([_entree(
            id_annonce='603',
            url='https://www.avito.ma/fr/autre_secteur/terrains_et_fermes/x_603.htm',
            titre='Beau terrain agricole à Meknès Ville, proche axes routiers',
        )])

        parcelle = Annonce.objects.get(source_id='603').parcelle
        self.assertEqual(parcelle.commune_geom_id, self.commune_geom.pk)
        self.assertIsNotNone(parcelle.latitude)
        self.assertTrue(parcelle.is_geolocated())

    def test_repli_region_quand_aucune_commune_mais_la_region_est_nommee(self):
        """Ni l'URL ni le titre/la description ne nomment une commune
        connue, mais la région ("Fès-Meknès") apparaît dans la description
        — repli approximatif au centroïde de la région : coordonnées
        renseignées, mais `commune_geom` volontairement laissé NULL (décision
        produit du 2026-08-18) donc `is_geolocated()` reste False et
        can_publish() continue de bloquer la publication de cette annonce."""
        self.importer([_entree(
            id_annonce='604',
            url='https://www.avito.ma/fr/autre_secteur/terrains_et_fermes/x_604.htm',
            titre='Terrain agricole à vendre',
            description='Beau terrain situé dans la région de Fès-Meknès, proche de la ville.',
        )])

        parcelle = Annonce.objects.get(source_id='604').parcelle
        self.assertIsNone(parcelle.commune_geom)
        self.assertIsNotNone(parcelle.latitude)
        self.assertIsNotNone(parcelle.longitude)
        self.assertIsNotNone(parcelle.geom)
        self.assertFalse(parcelle.is_geolocated())
        peut_publier, raisons = Annonce.objects.get(source_id='604').can_publish()
        self.assertFalse(peut_publier)
        self.assertIn(
            "La localisation de la parcelle doit être renseignée avant publication.",
            raisons,
        )

    def test_commune_prioritaire_sur_region_quand_les_deux_sont_nommees(self):
        """Le titre nomme à la fois la commune ET, via la description, sa
        région — la commune (plus précise) l'emporte, jamais le repli région
        alors qu'une résolution précise est possible."""
        self.importer([_entree(
            id_annonce='605',
            url='https://www.avito.ma/fr/autre_secteur/terrains_et_fermes/x_605.htm',
            titre='Terrain à Meknès Ville',
            description='Située dans la région de Fès-Meknès.',
        )])

        parcelle = Annonce.objects.get(source_id='605').parcelle
        self.assertEqual(parcelle.commune_geom_id, self.commune_geom.pk)


class ImportPhotosEtPublicationTests(ImportScrapedDataTestBase):
    def _reponse_image_factice(self, *args, **kwargs):
        reponse = Mock()
        reponse.status_code = 200
        reponse.content = image_jpeg().read()
        reponse.raise_for_status = Mock()
        return reponse

    @patch('annonces.management.commands.import_scraped_data.requests.get')
    def test_annonce_complete_geolocalisee_avec_photo_est_publiee(self, mock_get):
        """Reproduit exactement le chemin can_publish() réel (jamais
        contourné) : geoloc + photo + prix positif => brouillon -> en_ligne
        via la même méthode que l'API, pas une copie de la règle."""
        mock_get.side_effect = self._reponse_image_factice

        chemin = _fichier_json_temporaire([_entree(
            id_annonce='701',
            url='https://www.avito.ma/fr/meknes_ville/terrains_et_fermes/x_701.htm',
            images=['https://content.avito.ma/classifieds/images/1?t=images'],
        )])
        call_command('import_scraped_data', source='avito', file=chemin)

        annonce = Annonce.objects.get(source_id='701')
        self.assertEqual(annonce.statut, Annonce.StatutAnnonce.EN_LIGNE)
        self.assertIsNotNone(annonce.date_publication)
        self.assertEqual(annonce.photos.count(), 1)

    # Mocker requests.get() seul ne suffit pas à simuler un "réseau
    # indisponible" : _recuperer_octets_image() retombe alors sur le repli
    # navigateur (_telecharger_via_navigateur, Playwright — réellement
    # installé dans cet environnement) qui, lui, N'EST PAS mocké et tente
    # une vraie requête réseau externe vers content.avito.ma, jusqu'à 15s de
    # timeout — pendant que la transaction DB de _importer_entree
    # (@transaction.atomic) reste ouverte. Constaté en CI/local : la
    # connexion Postgres finit fermée par l'environnement pendant cette
    # attente, corrompant tous les tests suivants du même run (job CI
    # 94769774541). Neutralisé ici aussi pour que ce test simule
    # effectivement une panne réseau totale, sans jamais sortir du process
    # de test.
    @patch('annonces.management.commands.import_scraped_data.Command._telecharger_via_navigateur')
    @patch('annonces.management.commands.import_scraped_data.requests.get')
    def test_telechargement_photo_echoue_reste_en_brouillon_jamais_de_crash(self, mock_get, mock_navigateur):
        mock_get.side_effect = ConnectionError('réseau indisponible')
        mock_navigateur.return_value = None

        chemin = _fichier_json_temporaire([_entree(
            id_annonce='702',
            url='https://www.avito.ma/fr/meknes_ville/terrains_et_fermes/x_702.htm',
            images=['https://content.avito.ma/classifieds/images/2?t=images'],
        )])
        call_command('import_scraped_data', source='avito', file=chemin)  # ne doit jamais lever

        annonce = Annonce.objects.get(source_id='702')
        self.assertEqual(annonce.statut, Annonce.StatutAnnonce.BROUILLON)
        self.assertEqual(annonce.photos.count(), 0)

    def test_sans_photo_reste_en_brouillon_meme_geolocalisee_avec_prix(self):
        self.importer([_entree(
            id_annonce='703',
            url='https://www.avito.ma/fr/meknes_ville/terrains_et_fermes/x_703.htm',
        )])

        annonce = Annonce.objects.get(source_id='703')
        self.assertEqual(annonce.statut, Annonce.StatutAnnonce.BROUILLON)


class ImportGardeFouProductionTests(ImportScrapedDataTestBase):
    """Audit du 2026-08-11 : cette commande importe des données de test,
    jamais destinée à la production — seconde ligne de défense en plus du
    filtre dataset_actif() (qui rendrait de toute façon ces annonces
    invisibles publiquement tant que AKAL_DATASET reste 'simulated')."""

    @patch('annonces.management.commands.import_scraped_data.settings')
    def test_refuse_sous_akal_settings_prod_sans_force(self, mock_settings):
        mock_settings.SETTINGS_MODULE = 'akal.settings.prod'

        with self.assertRaises(CommandError):
            self.importer([_entree(id_annonce='801')])

        self.assertFalse(Annonce.objects.filter(source_id='801').exists())

    @patch('annonces.management.commands.import_scraped_data.settings')
    def test_fonctionne_sous_prod_avec_force(self, mock_settings):
        mock_settings.SETTINGS_MODULE = 'akal.settings.prod'

        self.importer([_entree(id_annonce='802')], force=True)

        self.assertTrue(Annonce.objects.filter(source_id='802').exists())

    def test_aucune_restriction_sous_settings_dev(self):
        """Le garde-fou ne concerne que akal.settings.prod — dev/CI ne sont
        jamais bloqués."""
        self.importer([_entree(id_annonce='803')])  # pas de --force, doit passer

        self.assertTrue(Annonce.objects.filter(source_id='803').exists())


class DatasetActifTests(TestCase):
    """settings.AKAL_DATASET — bascule en lecture seule, jamais de
    suppression/modification des données de l'autre jeu (cf. managers.py)."""

    def setUp(self):
        parcelle = Parcelle.objects.create(surface_ha=Decimal('2.00'))
        bot_interne = User.objects.create_user(email='vendeur.interne@akal.ma', password='x', nom='I', prenom='N')
        bot_avito = User.objects.create_user(email='scraper.avito.test@akal.ma', password='x', nom='A', prenom='V')

        self.annonce_interne = Annonce.objects.create(
            parcelle=parcelle, proprietaire=bot_interne, titre='Annonce interne',
            description='', prix_mad=Decimal('100000.00'),
            statut=Annonce.StatutAnnonce.EN_LIGNE, source='interne',
        )
        self.annonce_avito = Annonce.objects.create(
            parcelle=parcelle, proprietaire=bot_avito, titre='Annonce avito',
            description='', prix_mad=Decimal('200000.00'),
            statut=Annonce.StatutAnnonce.EN_LIGNE, source='avito', source_id='dataset-test-1',
        )

    @override_settings(AKAL_DATASET='simulated')
    def test_dataset_simulated_ne_montre_que_les_annonces_internes(self):
        resultat = list(Annonce.objects.en_ligne().dataset_actif())

        self.assertIn(self.annonce_interne, resultat)
        self.assertNotIn(self.annonce_avito, resultat)

    @override_settings(AKAL_DATASET='scraped')
    def test_dataset_scraped_ne_montre_que_les_annonces_externes(self):
        resultat = list(Annonce.objects.en_ligne().dataset_actif())

        self.assertNotIn(self.annonce_interne, resultat)
        self.assertIn(self.annonce_avito, resultat)

    @override_settings(AKAL_DATASET='all')
    def test_dataset_all_montre_les_deux_jeux(self):
        """Défaut local depuis le 2026-08-17 (audit final) — cf. dev.py :
        évite qu'une annonce 'interne' fraîchement publiée en local
        retourne 404 sur sa propre fiche publique."""
        resultat = list(Annonce.objects.en_ligne().dataset_actif())

        self.assertIn(self.annonce_interne, resultat)
        self.assertIn(self.annonce_avito, resultat)

    def test_valeur_inconnue_replie_silencieusement_sur_simulated(self):
        with override_settings(AKAL_DATASET='n_importe_quoi'):
            resultat = list(Annonce.objects.en_ligne().dataset_actif())

        self.assertIn(self.annonce_interne, resultat)
        self.assertNotIn(self.annonce_avito, resultat)

    @override_settings(AKAL_DATASET='scraped')
    def test_api_publique_respecte_la_bascule(self):
        response = APIClient().get(ANNONCES_URL)

        titres = [a['titre'] for a in response.data['results']]
        self.assertIn('Annonce avito', titres)
        self.assertNotIn('Annonce interne', titres)


class AdminModerationTests(AnnoncesTestBase):
    """Actions groupées de l'admin (publier_selection/rejeter_selection) et
    restriction get_readonly_fields — audit admin du 19/08. Appelle les
    fonctions d'action directement (pas un round-trip HTTP par le formulaire
    d'actions de l'admin) : plus rapide, et c'est la même logique métier
    testée soit qu'on la déclenche depuis /admin/ ou en Python."""

    def setUp(self):
        super().setUp()
        self.vendeur = self.authentifier()
        self.factory = RequestFactory()
        self.superuser = User.objects.create_superuser(
            email='admin@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='Admin', prenom='AKAL',
        )
        self.moderateur = User.objects.create_user(
            email='moderateur@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='Modo', prenom='AKAL', is_staff=True,
        )
        self.moderateur.groups.add(Group.objects.get(name='Modérateurs'))
        self.modeladmin = admin.site._registry[Annonce]

    def _requete(self, user):
        # message_user() (appelé par les deux actions) a besoin d'un backend
        # de messages sur la requête — FallbackStorage est le plus simple
        # sans passer par le vrai middleware de session, mais il essaie
        # d'abord le stockage en session (avant le repli sur cookie), donc
        # `request.session` doit exister ; un dict simple suffit à son usage
        # (get/__setitem__), pas besoin d'un vrai SessionStore.
        request = self.factory.get('/admin/annonces/annonce/')
        request.user = user
        request.session = {}
        request._messages = FallbackStorage(request)
        return request

    def _annonce_eligible(self, statut):
        """Annonce satisfaisant can_publish() (géoloc + photo + prix), forcée
        au statut demandé — jamais via l'API (aucun déclencheur ne mène
        actuellement à en_attente, cf. transitions.py), à la main comme le
        ferait un futur flux de modération."""
        annonce_id = self.creer_brouillon().data['id']
        self.localiser(annonce_id)
        self.client.patch(
            f'{ANNONCES_URL}{annonce_id}/', {'photos[]': [image_jpeg()]},
            format='multipart', **self.csrf_headers(),
        )
        annonce = Annonce.objects.get(id=annonce_id)
        annonce.statut = statut
        annonce.save(update_fields=['statut'])
        return annonce

    def test_publier_selection_publie_en_attente_et_brouillon_eligibles(self):
        en_attente = self._annonce_eligible(Annonce.StatutAnnonce.EN_ATTENTE)
        brouillon = self._annonce_eligible(Annonce.StatutAnnonce.BROUILLON)
        request = self._requete(self.superuser)

        publier_selection(self.modeladmin, request, Annonce.objects.filter(id__in=[en_attente.id, brouillon.id]))

        en_attente.refresh_from_db()
        brouillon.refresh_from_db()
        self.assertEqual(en_attente.statut, Annonce.StatutAnnonce.EN_LIGNE)
        self.assertEqual(brouillon.statut, Annonce.StatutAnnonce.EN_LIGNE)
        self.assertIsNotNone(en_attente.date_publication)

    def test_publier_selection_ignore_les_annonces_sans_photo(self):
        annonce_id = self.creer_brouillon().data['id']
        self.localiser(annonce_id)
        annonce = Annonce.objects.get(id=annonce_id)  # jamais de photo -> can_publish() False
        request = self._requete(self.superuser)

        publier_selection(self.modeladmin, request, Annonce.objects.filter(id=annonce.id))

        annonce.refresh_from_db()
        self.assertEqual(annonce.statut, Annonce.StatutAnnonce.BROUILLON)

    def test_publier_selection_ignore_une_annonce_deja_en_ligne(self):
        annonce = self._annonce_eligible(Annonce.StatutAnnonce.EN_LIGNE)
        request = self._requete(self.superuser)

        # en_ligne -> en_ligne n'est pas une arête du graphe (transitions.py)
        publier_selection(self.modeladmin, request, Annonce.objects.filter(id=annonce.id))

        annonce.refresh_from_db()
        self.assertEqual(annonce.statut, Annonce.StatutAnnonce.EN_LIGNE)  # inchangé, pas une erreur

    def test_rejeter_selection_repasse_en_attente_vers_brouillon(self):
        annonce = self._annonce_eligible(Annonce.StatutAnnonce.EN_ATTENTE)
        request = self._requete(self.superuser)

        rejeter_selection(self.modeladmin, request, Annonce.objects.filter(id=annonce.id))

        annonce.refresh_from_db()
        self.assertEqual(annonce.statut, Annonce.StatutAnnonce.BROUILLON)

    def test_rejeter_selection_ignore_une_annonce_en_ligne(self):
        annonce = self._annonce_eligible(Annonce.StatutAnnonce.EN_LIGNE)
        request = self._requete(self.superuser)

        rejeter_selection(self.modeladmin, request, Annonce.objects.filter(id=annonce.id))

        annonce.refresh_from_db()
        self.assertEqual(annonce.statut, Annonce.StatutAnnonce.EN_LIGNE)  # seul "en attente" peut être rejeté

    def test_statut_lecture_seule_pour_un_moderateur_pas_pour_un_superutilisateur(self):
        request_modo = self._requete(self.moderateur)
        request_admin = self._requete(self.superuser)

        self.assertIn('statut', self.modeladmin.get_readonly_fields(request_modo))
        self.assertNotIn('statut', self.modeladmin.get_readonly_fields(request_admin))

    def test_groupe_moderateurs_na_pas_acces_aux_utilisateurs(self):
        # Périmètre volontairement restreint (migration 0009) — un
        # modérateur review du contenu, jamais les comptes.
        self.assertFalse(self.moderateur.has_perm('accounts.change_user'))
        self.assertTrue(self.moderateur.has_perm('annonces.change_annonce'))


class AlertesRechercheSauvegardeeTests(AnnoncesTestBase):
    """Signal + matching + notification/email — cf. signals.py/alertes.py.
    RECHERCHE_URL : réutilise ANNONCES_URL en préfixe, comme le reste des
    tests de ce module (jamais l'URL complète codée en dur ailleurs)."""

    def setUp(self):
        super().setUp()
        self.vendeur = self.authentifier(email='vendeur@akal.ma')
        self.acheteur = User.objects.create_user(
            email='acheteur@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='Acheteur', prenom='Test',
        )

    def _annonce_eligible(self, proprietaire_email='vendeur@akal.ma'):
        """Annonce en brouillon, géolocalisée + une photo (satisfait
        can_publish()), déposée par `proprietaire_email` (déjà authentifié
        comme self.client à cet instant)."""
        annonce_id = self.creer_brouillon().data['id']
        self.localiser(annonce_id)
        self.client.patch(
            f'{ANNONCES_URL}{annonce_id}/', {'photos[]': [image_jpeg()]},
            format='multipart', **self.csrf_headers(),
        )
        return annonce_id

    def _publier(self, annonce_id):
        # captureOnCommitCallbacks(execute=True) : TestCase enveloppe chaque
        # test dans une transaction qui n'est JAMAIS réellement commitée
        # (rollback en fin de test, pour l'isolation) — sans ce contexte,
        # transaction.on_commit() (signals.py) ne s'exécute donc jamais ici,
        # alors qu'il s'exécute bien en usage réel (une vraie requête HTTP
        # commite pour de vrai). Ce contexte simule ce commit pour que le
        # callback parte quand même, comme en production.
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(
                f'{ANNONCES_URL}{annonce_id}/', {'statut': 'en_ligne'}, format='json', **self.csrf_headers(),
            )
        return response

    def test_publication_notifie_une_recherche_correspondante(self):
        annonce_id = self._annonce_eligible()
        recherche = RechercheSauvegardee.objects.create(
            utilisateur=self.acheteur, nom='Fès-Meknès', criteres={'region': 'fes-meknes'},
        )

        response = self._publier(annonce_id)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        notif = Notification.objects.filter(
            destinataire=self.acheteur, type_notif=Notification.TypeNotif.ALERTE_RECHERCHE,
        )
        self.assertEqual(notif.count(), 1)
        self.assertEqual(str(notif.first().annonce_id), annonce_id)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.acheteur.email, mail.outbox[0].to)
        self.assertIn(recherche.nom, mail.outbox[0].subject + ''.join(mail.outbox[0].body))

    def test_publication_ne_notifie_pas_une_recherche_qui_ne_correspond_pas(self):
        annonce_id = self._annonce_eligible()
        RechercheSauvegardee.objects.create(
            utilisateur=self.acheteur, criteres={'region': 'oriental'},  # notre annonce est fes-meknes
        )

        self._publier(annonce_id)

        self.assertFalse(Notification.objects.filter(destinataire=self.acheteur).exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_recherche_inactive_ne_notifie_pas(self):
        annonce_id = self._annonce_eligible()
        RechercheSauvegardee.objects.create(
            utilisateur=self.acheteur, criteres={'region': 'fes-meknes'}, actif=False,
        )

        self._publier(annonce_id)

        self.assertFalse(Notification.objects.filter(destinataire=self.acheteur).exists())

    def test_le_vendeur_ne_recoit_jamais_dalerte_pour_sa_propre_annonce(self):
        annonce_id = self._annonce_eligible()
        RechercheSauvegardee.objects.create(
            utilisateur=self.vendeur, criteres={'region': 'fes-meknes'},
        )

        self._publier(annonce_id)

        self.assertFalse(Notification.objects.filter(destinataire=self.vendeur, type_notif=Notification.TypeNotif.ALERTE_RECHERCHE).exists())

    def test_republication_ne_notifie_pas_une_seconde_fois(self):
        # archivee -> en_ligne (réactivation) sur une annonce DÉJÀ passée
        # une fois par en_ligne ne doit pas redéclencher pour autant si elle
        # y est déjà — ce test couvre spécifiquement l'inverse : deux PATCH
        # 'en_ligne' de suite (le second no-op, transition_autorisee rejette
        # en_ligne -> en_ligne) ne doublent pas la notification.
        annonce_id = self._annonce_eligible()
        RechercheSauvegardee.objects.create(utilisateur=self.acheteur, criteres={'region': 'fes-meknes'})

        self._publier(annonce_id)
        self._publier(annonce_id)  # rejeté par transition_autorisee, statut déjà en_ligne

        self.assertEqual(Notification.objects.filter(destinataire=self.acheteur).count(), 1)

    def test_action_admin_publier_selection_declenche_aussi_lalerte(self):
        # Même signal, quel que soit le chemin qui écrit statut=en_ligne
        # (cf. docstring signals.py) — vérifié ici via l'action admin
        # plutôt que par l'API, pour couvrir un DEUXIÈME chemin distinct.
        annonce_id = self._annonce_eligible()
        RechercheSauvegardee.objects.create(utilisateur=self.acheteur, criteres={'region': 'fes-meknes'})

        factory = RequestFactory()
        request = factory.get('/admin/annonces/annonce/')
        request.user = self.vendeur
        request.session = {}
        request._messages = FallbackStorage(request)
        modeladmin = admin.site._registry[Annonce]
        with self.captureOnCommitCallbacks(execute=True):  # cf. commentaire de _publier() ci-dessus
            publier_selection(modeladmin, request, Annonce.objects.filter(id=annonce_id))

        self.assertTrue(Notification.objects.filter(destinataire=self.acheteur, type_notif=Notification.TypeNotif.ALERTE_RECHERCHE).exists())

    def test_notifier_recherches_correspondantes_ignore_une_annonce_pas_en_ligne(self):
        # Appel direct (pas via le signal) sur une annonce encore en
        # brouillon — filet de sécurité de la fonction elle-même (cf.
        # commentaire alertes.py), jamais supposé n'être vérifié que côté
        # signal.
        annonce_id = self._annonce_eligible()
        RechercheSauvegardee.objects.create(utilisateur=self.acheteur, criteres={'region': 'fes-meknes'})

        notifier_recherches_correspondantes(annonce_id)

        self.assertFalse(Notification.objects.filter(destinataire=self.acheteur).exists())


class RechercheSauvegardeeAPITests(AnnoncesTestBase):
    URL = f'{ANNONCES_URL}recherches-sauvegardees/'

    def setUp(self):
        super().setUp()
        self.user = self.authentifier(email='investisseur@akal.ma')

    def test_creer_une_recherche(self):
        response = self.client.post(
            self.URL,
            {'nom': 'Souss-Massa >2ha', 'criteres': {'region': 'souss-massa', 'surface_min': '2'}},
            format='json', **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        recherche = RechercheSauvegardee.objects.get(id=response.data['id'])
        self.assertEqual(recherche.utilisateur, self.user)
        self.assertEqual(recherche.criteres, {'region': 'souss-massa', 'surface_min': '2'})

    def test_criteres_doit_etre_un_objet(self):
        response = self.client.post(
            self.URL, {'nom': 'Invalide', 'criteres': ['pas', 'un', 'objet']},
            format='json', **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_liste_scopee_a_lutilisateur_connecte(self):
        RechercheSauvegardee.objects.create(utilisateur=self.user, nom='La mienne', criteres={})
        autre = User.objects.create_user(email='autre@akal.ma', password='un-mot-de-passe-solide-2026', nom='A', prenom='B')
        RechercheSauvegardee.objects.create(utilisateur=autre, nom='Pas la mienne', criteres={})

        response = self.client.get(self.URL)

        noms = [r['nom'] for r in response.data]
        self.assertIn('La mienne', noms)
        self.assertNotIn('Pas la mienne', noms)

    def test_ne_peut_pas_supprimer_la_recherche_dun_autre(self):
        autre = User.objects.create_user(email='autre2@akal.ma', password='un-mot-de-passe-solide-2026', nom='A', prenom='B')
        recherche = RechercheSauvegardee.objects.create(utilisateur=autre, criteres={})

        response = self.client.delete(f'{self.URL}{recherche.id}/', **self.csrf_headers())

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(RechercheSauvegardee.objects.filter(id=recherche.id).exists())

    def test_peut_mettre_en_pause_sans_supprimer(self):
        recherche = RechercheSauvegardee.objects.create(utilisateur=self.user, criteres={})

        response = self.client.patch(
            f'{self.URL}{recherche.id}/', {'actif': False}, format='json', **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        recherche.refresh_from_db()
        self.assertFalse(recherche.actif)

    def test_anonyme_ne_peut_pas_creer_de_recherche(self):
        self.client.logout()

        response = self.client.post(self.URL, {'nom': 'x', 'criteres': {}}, format='json')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ──────────────────────────────────────────────
# WHATSAPP — _numero_whatsapp / _message_whatsapp / get_whatsapp_lien
# (audit final du 20/08, P9 — jusqu'ici sans test dédié malgré leur rôle
# dans une fonctionnalité différenciante du produit)
# ──────────────────────────────────────────────

class NumeroWhatsAppTests(SimpleTestCase):
    """_numero_whatsapp() — fonction pure, aucun accès base nécessaire."""

    def test_numero_marocain_national_valide(self):
        self.assertEqual(_numero_whatsapp('0612345678'), '212612345678')

    def test_numero_avec_prefixe_international_valide(self):
        self.assertEqual(_numero_whatsapp('+212612345678'), '212612345678')

    def test_numero_avec_espaces_est_normalise(self):
        # Espaces courants d'une saisie humaine (profil /compte) — retirés
        # avant normalisation, quel que soit le format d'origine.
        self.assertEqual(_numero_whatsapp('+212 6 12 34 56 78'), '212612345678')
        self.assertEqual(_numero_whatsapp('06 12 34 56 78'), '212612345678')

    def test_numero_invalide_retourne_none(self):
        # Ne commence ni par '0' ni par '+212' — format non reconnu, jamais
        # un lien construit sur une donnée dont la forme n'est pas sûre.
        self.assertIsNone(_numero_whatsapp('123456789'))
        self.assertIsNone(_numero_whatsapp('+33612345678'))

    def test_numero_avec_caracteres_non_numeriques_retourne_none(self):
        self.assertIsNone(_numero_whatsapp('06ABCD5678'))

    def test_numero_absent_retourne_none(self):
        self.assertIsNone(_numero_whatsapp(None))
        self.assertIsNone(_numero_whatsapp(''))


class MessageWhatsAppTests(AnnoncesTestBase):
    """_message_whatsapp() (fonction pure) + endpoint authentifié
    GET /api/annonces/<uuid>/whatsapp/ (WhatsAppLienAPIView).

    Hardening 2026-08-30 : le lien wa.me (qui contient le numéro en clair)
    n'est PLUS dans AnnonceDetailSerializer — le DTO public ne porte qu'un
    booléen `whatsapp_disponible`. Le lien s'obtient via l'endpoint dédié,
    authentifié et throttlé."""

    def creer_annonce(self, **overrides):
        proprietaire = overrides.pop('proprietaire', None) or User.objects.create_user(
            email='proprio-whatsapp@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='Alaoui', prenom='Karim', telephone='+212612345678',
        )
        parcelle = Parcelle.objects.create(
            commune=self.commune, surface_ha=2.5, statut_foncier='melkia',
            acces_eau='irriguee', topographie='plat', acces_routier='goudron',
            latitude=33.5, longitude=-5.5,
        )
        defaults = {
            'parcelle': parcelle, 'proprietaire': proprietaire, 'titre': 'Belle parcelle',
            'description': 'Une description suffisamment longue.', 'prix_mad': 150000,
            'statut': Annonce.StatutAnnonce.EN_LIGNE,
        }
        defaults.update(overrides)
        return Annonce.objects.create(**defaults)

    def test_message_contient_reference_localisation_surface_et_prix(self):
        annonce = self.creer_annonce()

        message = _message_whatsapp(annonce)

        self.assertIn(f"AKAL-{str(annonce.id)[:8].upper()}", message)
        # "Meknès Ville" (self.commune, AnnoncesTestBase.setUp) — caractère
        # accentué transmis tel quel, jamais échappé/perdu à ce stade (c'est
        # get_whatsapp_lien ci-dessous qui gère l'encodage URL).
        self.assertIn("Meknès Ville", message)
        self.assertIn("2.5 ha", message)
        self.assertIn("150 000 MAD", message)

    def test_message_omet_les_lignes_sans_donnee_disponible(self):
        # Parcelle sans commune/commune_geom (aucune localisation connue) —
        # la ligne "Localisation" doit être absente, jamais "Localisation : None".
        parcelle_sans_commune = Parcelle.objects.create(surface_ha=1.0)
        annonce = Annonce.objects.create(
            parcelle=parcelle_sans_commune,
            proprietaire=User.objects.create_user(
                email='sans-loc@akal.ma', password='un-mot-de-passe-solide-2026',
                nom='X', prenom='Y', telephone='+212612345678',
            ),
            titre='Parcelle sans localisation', description='Description suffisamment longue.',
            prix_mad=100000, statut=Annonce.StatutAnnonce.EN_LIGNE,
        )

        message = _message_whatsapp(annonce)

        self.assertNotIn("Localisation", message)
        self.assertNotIn("None", message)

    def whatsapp_url(self, annonce):
        return f'{ANNONCES_URL}{annonce.id}/whatsapp/'

    def test_endpoint_whatsapp_refuse_lanonyme(self):
        annonce = self.creer_annonce()

        response = self.client.get(self.whatsapp_url(annonce))

        # Un visiteur anonyme ne doit jamais pouvoir récupérer un numéro de
        # vendeur — c'est tout l'objet du déplacement du lien hors du DTO public.
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_endpoint_whatsapp_construit_le_lien_pour_un_utilisateur_connecte(self):
        annonce = self.creer_annonce()  # propriétaire : téléphone +212612345678
        self.authentifier('acheteur@akal.ma')  # appelant : un autre compte, connecté

        response = self.client.get(self.whatsapp_url(annonce))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        lien = response.data['whatsapp_lien']
        self.assertTrue(lien.startswith('https://wa.me/212612345678?text='))
        # Message encodé pour l'URL (urllib.parse.quote) : aucun retour à la
        # ligne ni espace littéral, accent "è" encodé %C3%A8.
        self.assertNotIn('\n', lien)
        self.assertNotIn(' ', lien)
        self.assertIn('%C3%A8', lien)

    def test_endpoint_whatsapp_retourne_none_si_vendeur_sans_numero(self):
        proprietaire = User.objects.create_user(
            email='sans-tel@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='Z', prenom='W', telephone='',
        )
        annonce = self.creer_annonce(proprietaire=proprietaire)
        self.authentifier('acheteur@akal.ma')

        response = self.client.get(self.whatsapp_url(annonce))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['whatsapp_lien'])

    def test_endpoint_whatsapp_404_sur_annonce_non_publiee(self):
        proprietaire = User.objects.create_user(
            email='vendeur-brouillon@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='B', prenom='R', telephone='+212612345678',
        )
        annonce = self.creer_annonce(proprietaire=proprietaire, statut=Annonce.StatutAnnonce.BROUILLON)
        self.authentifier('acheteur@akal.ma')

        response = self.client.get(self.whatsapp_url(annonce))

        # Même portée que la fiche publique : un brouillon n'existe pas pour
        # un tiers → 404, jamais 403.
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_serializer_public_nexpose_ni_lien_ni_numero(self):
        annonce = self.creer_annonce()

        data = AnnonceDetailSerializer(annonce).data

        # Plus de champ `whatsapp_lien` (contenait le numéro dans l'URL).
        self.assertNotIn('whatsapp_lien', data)
        # Le numéro ne doit apparaître nulle part dans la représentation.
        import json
        corps = json.dumps(data, default=str)
        self.assertNotIn('wa.me', corps)
        self.assertNotIn(str(annonce.proprietaire.telephone).replace('+', ''), corps)
        # Le DTO ne porte plus qu'un booléen de disponibilité.
        self.assertIs(data['whatsapp_disponible'], True)

    def test_whatsapp_disponible_false_si_vendeur_sans_numero(self):
        proprietaire = User.objects.create_user(
            email='no-tel@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='N', prenom='T', telephone='',
        )
        annonce = self.creer_annonce(proprietaire=proprietaire)

        data = AnnonceDetailSerializer(annonce).data

        self.assertIs(data['whatsapp_disponible'], False)

    def test_numero_brut_du_proprietaire_najamais_fuite_dans_le_serializer_public(self):
        # RGPD (loi 09-08) — ProprietaireSerializer ne doit exposer que l'UUID
        # et une version masquée, jamais un champ `telephone` brut.
        annonce = self.creer_annonce()

        data = AnnonceDetailSerializer(annonce).data

        self.assertNotIn('telephone', data['proprietaire'])
        self.assertIn('telephone_masque', data['proprietaire'])
        self.assertNotEqual(data['proprietaire']['telephone_masque'], annonce.proprietaire.telephone)
        self.assertTrue(data['proprietaire']['telephone_masque'].startswith('+212 6 '))
        self.assertIn('**', data['proprietaire']['telephone_masque'])


class SourceAnnonceDansLAPITests(AnnoncesTestBase):
    """La fiche expose `source` et `source_url` — le front s'en sert pour
    masquer la messagerie/WhatsApp AKAL sur une annonce importée et renvoyer
    vers l'annonce d'origine (hardening 2026-08-31)."""

    def _annonce(self, source, source_url=None):
        parcelle = Parcelle.objects.create(
            commune=self.commune, commune_geom=self.commune_geom, surface_ha=2.0,
            statut_foncier='melkia', acces_eau='irriguee', topographie='plat',
            acces_routier='goudron', latitude=33.5, longitude=-5.5,
        )
        return Annonce.objects.create(
            parcelle=parcelle,
            proprietaire=User.objects.create_user(
                email=f'v-src-{source}@akal.ma', password='un-mot-de-passe-solide-2026',
                nom='S', prenom='R',
            ),
            titre=f'Annonce {source}', description='Description suffisamment longue.',
            prix_mad=200000, statut=Annonce.StatutAnnonce.EN_LIGNE,
            source=source, source_url=source_url,
        )

    def test_fiche_interne_source_interne_source_url_null(self):
        a = self._annonce(Annonce.Source.INTERNE)
        data = self.client.get(f'{ANNONCES_URL}{a.slug}/').data
        self.assertEqual(data['source'], 'interne')
        self.assertIsNone(data['source_url'])

    @override_settings(AKAL_DATASET='all')
    def test_fiche_externe_expose_source_et_source_url(self):
        a = self._annonce(Annonce.Source.AVITO, source_url='https://www.avito.ma/fr/annonce/xyz')
        data = self.client.get(f'{ANNONCES_URL}{a.slug}/').data
        self.assertEqual(data['source'], 'avito')
        self.assertEqual(data['source_url'], 'https://www.avito.ma/fr/annonce/xyz')

class LocalisationConfidentielleTests(AnnoncesTestBase):
    """
    loc_confidentielle=True → l'API publique renvoie une position FLOUTÉE
    (déterministe, ~1 km) à tout lecteur non-propriétaire ; jamais `geom` ni
    `contour`. loc_confidentielle=False → coordonnées exactes.
    """

    LAT_EXACTE = 33.512345
    LNG_EXACTE = -5.487654

    def _creer(self, *, confidentielle, proprietaire=None):
        proprietaire = proprietaire or User.objects.create_user(
            email=f'v-conf-{confidentielle}@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='C', prenom='L',
        )
        parcelle = Parcelle.objects.create(
            commune=self.commune, commune_geom=self.commune_geom, surface_ha=4.0,
            statut_foncier='melkia', acces_eau='irriguee', topographie='plat',
            acces_routier='goudron',
            latitude=self.LAT_EXACTE, longitude=self.LNG_EXACTE,
            geom=Point(self.LNG_EXACTE, self.LAT_EXACTE, srid=4326),
        )
        return Annonce.objects.create(
            parcelle=parcelle, proprietaire=proprietaire,
            titre='Parcelle confidentielle' if confidentielle else 'Parcelle ouverte',
            description='Description suffisamment longue.', prix_mad=300000,
            statut=Annonce.StatutAnnonce.EN_LIGNE, loc_confidentielle=confidentielle,
        )

    def test_non_confidentielle_expose_les_coordonnees_exactes(self):
        annonce = self._creer(confidentielle=False)

        response = self.client.get(f'{ANNONCES_URL}{annonce.slug}/')

        loc = response.data['parcelle']['localisation']
        self.assertEqual(loc['latitude'], self.LAT_EXACTE)
        self.assertEqual(loc['longitude'], self.LNG_EXACTE)

    def test_confidentielle_floute_la_position_pour_lanonyme(self):
        from .serializers import _flouter_position
        annonce = self._creer(confidentielle=True)

        response = self.client.get(f'{ANNONCES_URL}{annonce.slug}/')

        loc = response.data['parcelle']['localisation']
        # Ni la latitude ni la longitude exacte ne doit sortir.
        self.assertNotEqual(loc['latitude'], self.LAT_EXACTE)
        self.assertNotEqual(loc['longitude'], self.LNG_EXACTE)
        # Reste dans un rayon raisonnable (~1,5 km) du vrai point.
        self.assertLess(abs(loc['latitude'] - self.LAT_EXACTE), 0.015)
        self.assertLess(abs(loc['longitude'] - self.LNG_EXACTE), 0.015)
        # Déterministe : exactement la valeur de _flouter_position(parcelle_id).
        lat_attendue, lng_attendue = _flouter_position(
            self.LAT_EXACTE, self.LNG_EXACTE, annonce.parcelle_id,
        )
        self.assertEqual(loc['latitude'], lat_attendue)
        self.assertEqual(loc['longitude'], lng_attendue)

    def test_confidentielle_position_stable_entre_deux_requetes(self):
        annonce = self._creer(confidentielle=True)

        r1 = self.client.get(f'{ANNONCES_URL}{annonce.slug}/').data['parcelle']['localisation']
        r2 = self.client.get(f'{ANNONCES_URL}{annonce.slug}/').data['parcelle']['localisation']

        self.assertEqual((r1['latitude'], r1['longitude']), (r2['latitude'], r2['longitude']))

    def test_confidentielle_floutee_aussi_dans_la_liste(self):
        annonce = self._creer(confidentielle=True)

        response = self.client.get(ANNONCES_URL)

        cible = next(a for a in response.data['results'] if a['id'] == str(annonce.id))
        loc = cible['parcelle']['localisation']
        self.assertNotEqual(loc['latitude'], self.LAT_EXACTE)
        self.assertNotEqual(loc['longitude'], self.LNG_EXACTE)

    def test_proprietaire_connecte_voit_ses_coordonnees_exactes(self):
        proprietaire = self.authentifier('proprio-conf@akal.ma')
        annonce = self._creer(confidentielle=True, proprietaire=proprietaire)

        response = self.client.get(f'{ANNONCES_URL}{annonce.slug}/')

        loc = response.data['parcelle']['localisation']
        self.assertEqual(loc['latitude'], self.LAT_EXACTE)
        self.assertEqual(loc['longitude'], self.LNG_EXACTE)

    def test_autre_utilisateur_connecte_ne_voit_pas_les_coordonnees_exactes(self):
        annonce = self._creer(confidentielle=True)
        self.authentifier('curieux@akal.ma')  # connecté, mais pas le propriétaire

        response = self.client.get(f'{ANNONCES_URL}{annonce.slug}/')

        loc = response.data['parcelle']['localisation']
        self.assertNotEqual(loc['latitude'], self.LAT_EXACTE)

    def test_ni_geom_ni_contour_dans_la_fiche_publique(self):
        annonce = self._creer(confidentielle=True)

        response = self.client.get(f'{ANNONCES_URL}{annonce.slug}/')

        import json
        corps = json.dumps(response.data, default=str)
        self.assertNotIn('geom', response.data['parcelle'])
        self.assertNotIn('contour', response.data['parcelle'])
        # Aucune trace de la coordonnée exacte nulle part dans le corps.
        self.assertNotIn(str(self.LAT_EXACTE), corps)
        self.assertNotIn(str(self.LNG_EXACTE), corps)


class BackfillCommuneGeomTests(APITestCase):
    """`manage.py backfill_commune_geom` — jointure spatiale pour rattacher
    `Parcelle.commune_geom` aux parcelles géolocalisées qui ne l'ont pas."""

    def setUp(self):
        self.region = RegionOfficielle.objects.create(code=3, slug='fes-meknes', nom='Fès-Meknès')
        self.province = ProvinceGeom.objects.create(
            iso='MA-03-131', nom='Meknès', region=self.region,
            geom=_polygone_carre(-5.5, 33.5),
        )
        self.commune = CommuneGeom.objects.create(
            source_fid=1, libelle='MU MEKNES', nom_affichage='Meknès',
            type_commune='MU', province=self.province,
            geom=_polygone_carre(-5.5, 33.5, demi_cote=0.05),
        )

    def test_rattache_une_parcelle_dans_le_polygone(self):
        parcelle = Parcelle.objects.create(
            surface_ha=2, latitude=33.5, longitude=-5.5, commune_geom=None,
        )
        call_command('backfill_commune_geom')
        parcelle.refresh_from_db()
        self.assertEqual(parcelle.commune_geom_id, self.commune.pk)

    def test_dry_run_n_ecrit_rien(self):
        parcelle = Parcelle.objects.create(
            surface_ha=2, latitude=33.5, longitude=-5.5, commune_geom=None,
        )
        call_command('backfill_commune_geom', dry_run=True)
        parcelle.refresh_from_db()
        self.assertIsNone(parcelle.commune_geom_id)

    def test_ignore_une_parcelle_hors_de_tout_polygone(self):
        parcelle = Parcelle.objects.create(
            surface_ha=2, latitude=10.0, longitude=10.0, commune_geom=None,
        )
        call_command('backfill_commune_geom')
        parcelle.refresh_from_db()
        self.assertIsNone(parcelle.commune_geom_id)

    def test_ne_touche_pas_une_parcelle_deja_rattachee(self):
        autre = CommuneGeom.objects.create(
            source_fid=2, libelle='CR AUTRE', nom_affichage='Autre',
            province=self.province, geom=_polygone_carre(-6.5, 34.5),
        )
        parcelle = Parcelle.objects.create(
            surface_ha=2, latitude=33.5, longitude=-5.5, commune_geom=autre,
        )
        call_command('backfill_commune_geom')
        parcelle.refresh_from_db()
        self.assertEqual(parcelle.commune_geom_id, autre.pk)


class GardeFousPlausibiliteTests(AnnoncesTestBase):
    """Garde-fous prix/surface au dépôt et à l'édition (F03) — validation
    SERVEUR, jamais déléguée au frontend (annonces/serializers.py)."""

    def setUp(self):
        super().setUp()
        self.authentifier()

    def _post(self, **overrides):
        return self.creer_brouillon(**overrides)

    # ── prix ─────────────────────────────────────────────────────────────
    def test_prix_negatif_refuse_a_la_creation(self):
        r = self._post(prix_mad=-1)
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('prix_mad', r.data)

    def test_prix_zero_refuse_a_la_creation(self):
        r = self._post(prix_mad=0)
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_prix_absurde_refuse(self):
        # 1 milliard MAD pour 2,5 ha — le cas "boll" de l'audit.
        r = self._post(prix_mad=1_000_000_000)
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('prix_mad', r.data)

    # ── surface ──────────────────────────────────────────────────────────
    def test_surface_zero_refusee(self):
        r = self._post(parcelle={'surface_ha': 0, 'statut_foncier': 'melkia'})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_surface_absurde_refusee(self):
        r = self._post(prix_mad=5_000_000, parcelle={'surface_ha': 50000, 'statut_foncier': 'melkia'})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    # ── prix rapporté à la surface ───────────────────────────────────────
    def test_prix_incoherent_avec_la_surface_trop_bas(self):
        # 1 000 000 MAD / 2500 ha = 0,04 MAD/m² — trop bas.
        r = self._post(prix_mad=1_000_000, parcelle={'surface_ha': 2500, 'statut_foncier': 'melkia'})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('prix_mad', r.data)

    def test_prix_incoherent_avec_la_surface_trop_haut(self):
        # 100 000 000 MAD / 1 ha = 10 000 MAD/m² — ce n'est plus du foncier agricole.
        r = self._post(prix_mad=100_000_000, parcelle={'surface_ha': 1, 'statut_foncier': 'melkia'})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_prix_seul_recoupe_la_surface_existante(self):
        annonce_id = self._post().data['id']  # 150 000 MAD / 2,5 ha = 6 MAD/m² : OK
        r = self.client.patch(
            f'{ANNONCES_URL}{annonce_id}/', {'prix_mad': 900_000_000},
            format='json', **self.csrf_headers(),
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    # ── cas nominal ──────────────────────────────────────────────────────
    def test_annonce_plausible_acceptee(self):
        r = self._post(prix_mad=850_000, parcelle={
            'surface_ha': 12, 'statut_foncier': 'melkia', 'acces_eau': 'irriguee',
            'topographie': 'plat', 'acces_routier': 'goudron',
        })
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.data)

    # ── invariant base (défense en profondeur) ──────────────────────────
    def test_contrainte_base_prix_strictement_positif(self):
        from django.db import IntegrityError, transaction as db_tx
        parcelle = Parcelle.objects.create(surface_ha=Decimal('1.00'))
        with self.assertRaises(IntegrityError):
            with db_tx.atomic():
                Annonce.objects.create(
                    parcelle=parcelle, proprietaire=User.objects.first(),
                    titre='x', description='y', prix_mad=Decimal('0.00'),
                )

    def test_contrainte_base_surface_strictement_positive(self):
        from django.db import IntegrityError, transaction as db_tx
        with self.assertRaises(IntegrityError):
            with db_tx.atomic():
                Parcelle.objects.create(surface_ha=Decimal('0.00'))


class NettoyerBaseDemoTests(APITestCase):
    """`manage.py nettoyer_base_demo` — retire les résidus de dev sans jamais
    toucher aux données scrapées (avito/mubawab)."""

    def setUp(self):
        self.demo = User.objects.create_user(
            email='demo.vendeur1@akal.ma', password='x', nom='D', prenom='V',
        )
        self.bot = User.objects.create_user(
            email='scraper.avito@akal.ma', password='x', nom='Bot', prenom='Avito',
        )
        self.testeur = User.objects.create_user(
            email='uat-truc-123@akal.ma', password='x', nom='T', prenom='U',
        )
        self.admin = User.objects.create_superuser(
            email='root@akal.ma', password='x', nom='R', prenom='A',
        )

        # Annonce de démo (conservée)
        pd = Parcelle.objects.create(surface_ha=Decimal('2'))
        self.annonce_demo = Annonce.objects.create(
            parcelle=pd, proprietaire=self.demo, titre='Démo', description='d',
            prix_mad=Decimal('200000'), statut='en_ligne', source='interne',
        )
        # Annonce scrapée (JAMAIS touchée)
        ps = Parcelle.objects.create(surface_ha=Decimal('3'))
        self.annonce_scrapee = Annonce.objects.create(
            parcelle=ps, proprietaire=self.bot, titre='Avito', description='d',
            prix_mad=Decimal('500000'), statut='en_ligne', source='avito',
            source_id='av-1', source_url='https://avito.ma/x',
        )
        Photo.objects.create(annonce=self.annonce_scrapee, ordre=0)
        # Annonce de test interne (supprimée)
        pt = Parcelle.objects.create(surface_ha=Decimal('1'))
        self.annonce_test = Annonce.objects.create(
            parcelle=pt, proprietaire=self.testeur, titre='UAT test', description='d',
            prix_mad=Decimal('100000'), statut='en_ligne', source='interne',
        )
        # Parcelle orpheline (supprimée)
        self.orpheline = Parcelle.objects.create(surface_ha=Decimal('1'))

    def test_supprime_les_residus_mais_pas_le_scrape_ni_la_demo(self):
        call_command('nettoyer_base_demo')

        # Scrapé : rigoureusement intact
        self.assertTrue(Annonce.objects.filter(pk=self.annonce_scrapee.pk).exists())
        self.assertEqual(Photo.objects.filter(annonce__source='avito').count(), 1)
        self.assertTrue(User.objects.filter(email='scraper.avito@akal.ma').exists())

        # Démo : conservée
        self.assertTrue(Annonce.objects.filter(pk=self.annonce_demo.pk).exists())
        self.assertTrue(User.objects.filter(email='demo.vendeur1@akal.ma').exists())
        self.assertTrue(User.objects.filter(email='root@akal.ma').exists())  # superuser

        # Résidus : supprimés
        self.assertFalse(Annonce.objects.filter(pk=self.annonce_test.pk).exists())
        self.assertFalse(Parcelle.objects.filter(pk=self.orpheline.pk).exists())
        self.assertFalse(User.objects.filter(email='uat-truc-123@akal.ma').exists())

    def test_dry_run_n_ecrit_rien(self):
        call_command('nettoyer_base_demo', dry_run=True)
        self.assertTrue(Annonce.objects.filter(pk=self.annonce_test.pk).exists())
        self.assertTrue(Parcelle.objects.filter(pk=self.orpheline.pk).exists())
