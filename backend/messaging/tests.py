from django.contrib.gis.geos import Point
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.models import User
from annonces.models import Annonce, Parcelle
from geo.models import Commune, Province, Region
from .models import Favori

FAVORIS_URL = '/api/favoris/'
TOGGLE_URL = '/api/favoris/toggle/'


class FavorisTestCase(APITestCase):
    def setUp(self):
        self.client = APIClient()

        self.user = User.objects.create_user(
            email='acheteur@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='Bennani', prenom='Sara',
        )
        self.autre_user = User.objects.create_user(
            email='autre@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='Idrissi', prenom='Omar',
        )
        proprietaire = User.objects.create_user(
            email='vendeur@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='El Fassi', prenom='Ahmed',
        )

        region = Region.objects.create(id=1, nom='Fès-Meknès', code='fes-meknes')
        province = Province.objects.create(id=1, region=region, nom='Fès', code='fes')
        commune = Commune.objects.create(id=1, province=province, nom='Fès')

        parcelle = Parcelle.objects.create(
            commune=commune, surface_ha=5, statut_foncier=Parcelle.StatutFoncier.MELKIA,
            acces_eau=Parcelle.AccesEau.IRRIGUEE, topographie=Parcelle.Topographie.PLAT,
            acces_routier=Parcelle.AccesRoutier.GOUDRON, latitude=34.03, longitude=-5.0,
            geom=Point(-5.0, 34.03),
        )
        self.annonce = Annonce.objects.create(
            parcelle=parcelle, proprietaire=proprietaire, titre='Oliveraie de Fès',
            description='Une belle oliveraie.', prix_mad=850000,
            statut=Annonce.StatutAnnonce.EN_LIGNE,
        )

        autre_parcelle = Parcelle.objects.create(
            commune=commune, surface_ha=8, statut_foncier=Parcelle.StatutFoncier.MELKIA,
            acces_eau=Parcelle.AccesEau.BOUR, topographie=Parcelle.Topographie.PENTU,
            acces_routier=Parcelle.AccesRoutier.PISTE, latitude=34.05, longitude=-5.02,
            geom=Point(-5.02, 34.05),
        )
        self.autre_annonce = Annonce.objects.create(
            parcelle=autre_parcelle, proprietaire=proprietaire, titre='Terrain de Fès',
            description='Un autre terrain.', prix_mad=500000,
            statut=Annonce.StatutAnnonce.EN_LIGNE,
        )


class FavoriToggleTests(FavorisTestCase):
    def test_toggle_requires_authentication(self):
        response = self.client.post(TOGGLE_URL, {'annonce': str(self.annonce.id)})

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_toggle_creates_favori_when_absent(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(TOGGLE_URL, {'annonce': str(self.annonce.id)})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['is_favori'])
        self.assertTrue(Favori.objects.filter(user=self.user, annonce=self.annonce).exists())

    def test_toggle_removes_favori_when_present(self):
        self.client.force_authenticate(self.user)
        Favori.objects.create(user=self.user, annonce=self.annonce)

        response = self.client.post(TOGGLE_URL, {'annonce': str(self.annonce.id)})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_favori'])
        self.assertFalse(Favori.objects.filter(user=self.user, annonce=self.annonce).exists())

    def test_toggle_missing_annonce_returns_400(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(TOGGLE_URL, {})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('annonce', response.data)

    def test_toggle_unknown_annonce_returns_404(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(TOGGLE_URL, {'annonce': '00000000-0000-0000-0000-000000000000'})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_toggle_malformed_annonce_id_returns_404(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(TOGGLE_URL, {'annonce': 'pas-un-uuid'})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class FavoriListTests(FavorisTestCase):
    def test_list_requires_authentication(self):
        response = self.client.get(FAVORIS_URL)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_returns_only_current_user_favoris(self):
        Favori.objects.create(user=self.user, annonce=self.annonce)
        Favori.objects.create(user=self.autre_user, annonce=self.autre_annonce)
        self.client.force_authenticate(self.user)

        response = self.client.get(FAVORIS_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['annonce'], self.annonce.id)

    def test_list_empty_when_no_favoris(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(FAVORIS_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])
