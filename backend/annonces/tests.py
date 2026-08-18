"""
Tests de l'app annonces — F03 (dépôt d'annonce, upload photo MinIO).

Authentification réelle (signup + cookies), pas force_authenticate() : couvre
aussi le garde-fou CSRF (double-submit cookie/header), comme accounts/tests.py.
"""

import io

from django.contrib.gis.geos import MultiPolygon, Polygon
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.models import User
from geo.models import Commune, CommuneGeom, Province, ProvinceGeom, Region, RegionOfficielle
from messaging.models import Conversation, Favori, Message
from . import transitions
from .models import Annonce, Parcelle, Photo, StatistiqueAnnonce

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

    def test_publication_bloquee_prix_invalide_seul(self):
        self.localiser(self.annonce_id)
        self.uploader_une_photo()
        self.client.patch(
            f'{ANNONCES_URL}{self.annonce_id}/', {'prix_mad': 0}, format='json', **self.csrf_headers(),
        )

        response = self.publier()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(len(response.data['statut']), 1)
        self.assertIn('prix', response.data['statut'][0].lower())

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


class MesStatistiquesTests(AnnoncesTestBase):
    """
    GET /api/annonces/mes-annonces/statistiques/ — favoris/conversations
    reçus, messages non lus, vues totales (dashboard propriétaire). Les
    fixtures Favori/Conversation/Message/StatistiqueAnnonce sont créées
    directement en base (comme MessagingTestBase.creer_annonce) plutôt que
    via l'API : ce endpoint n'agrège que des compteurs, peu importe comment
    les lignes sont nées.
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
            'favoris_recus': 0, 'conversations_recues': 0, 'messages_non_lus': 0, 'vues_totales': 0,
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
            'favoris_recus': 0, 'conversations_recues': 0, 'messages_non_lus': 0, 'vues_totales': 0,
        })

    def test_somme_les_vues_de_toutes_ses_annonces(self):
        vendeur = self.authentifier('vendeur@akal.ma')
        annonce_a = self.creer_annonce_en_ligne(vendeur, titre='Annonce A')
        annonce_b = self.creer_annonce_en_ligne(vendeur, titre='Annonce B')
        StatistiqueAnnonce.objects.create(annonce=annonce_a, date='2026-08-01', vues=3)
        StatistiqueAnnonce.objects.create(annonce=annonce_a, date='2026-08-02', vues=2)
        StatistiqueAnnonce.objects.create(annonce=annonce_b, date='2026-08-01', vues=5)

        response = self.statistiques()

        self.assertEqual(response.data['vues_totales'], 10)

    def test_n_inclut_pas_les_vues_dun_autre_proprietaire(self):
        vendeur_a = self.authentifier('vendeur-a@akal.ma')
        annonce_a = self.creer_annonce_en_ligne(vendeur_a)
        StatistiqueAnnonce.objects.create(annonce=annonce_a, date='2026-08-01', vues=7)
        self.client.logout()
        vendeur_b = self.authentifier('vendeur-b@akal.ma')
        self.creer_annonce_en_ligne(vendeur_b, titre='Annonce du vendeur B')

        response = self.statistiques()

        self.assertEqual(response.data['vues_totales'], 0)


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
