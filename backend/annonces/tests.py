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
