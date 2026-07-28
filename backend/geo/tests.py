"""
Tests de l'app geo — référentiel régions/provinces/communes.

provinces/ et communes/ sont un ajout hors périmètre F03 (cf. décision du
2026-07-28, api_views.py) : construits par nécessité de test pour le
formulaire de dépôt d'annonce, à faire relire par Ibrahim (propriétaire
normal de ce module).
"""

from rest_framework import status
from rest_framework.test import APITestCase

from .models import Commune, Province, Region


class GeoReferentielTestBase(APITestCase):
    def setUp(self):
        self.region_1 = Region.objects.create(id=1, code='fes-meknes', nom='Fès-Meknès')
        self.region_2 = Region.objects.create(id=2, code='casablanca-settat', nom='Casablanca-Settat')
        self.province_1 = Province.objects.create(id=1, region=self.region_1, code='MEK', nom='Meknès')
        self.province_2 = Province.objects.create(id=2, region=self.region_2, code='NOU', nom='Nouaceur')
        self.commune_1 = Commune.objects.create(id=1, province=self.province_1, nom='Meknès Ville')
        self.commune_2 = Commune.objects.create(id=2, province=self.province_2, nom='Dar Bouazza')


class RegionListTests(GeoReferentielTestBase):
    def test_liste_toutes_les_regions_non_paginee(self):
        response = self.client.get('/api/geo/regions/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        self.assertNotIn('results', response.data)  # pas de pagination pour un référentiel


class ProvinceListTests(GeoReferentielTestBase):
    def test_sans_filtre_retourne_toutes_les_provinces(self):
        response = self.client.get('/api/geo/provinces/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_filtre_par_code_region(self):
        response = self.client.get('/api/geo/provinces/', {'region': 'fes-meknes'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([p['code'] for p in response.data], ['MEK'])

    def test_code_region_inconnu_retourne_liste_vide(self):
        response = self.client.get('/api/geo/provinces/', {'region': 'inexistante'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])


class CommuneListTests(GeoReferentielTestBase):
    def test_sans_filtre_retourne_toutes_les_communes(self):
        response = self.client.get('/api/geo/communes/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_filtre_par_code_province(self):
        response = self.client.get('/api/geo/communes/', {'province': 'NOU'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([c['nom'] for c in response.data], ['Dar Bouazza'])
        # Pas de champ `code` sur Commune (cf. geo/models.py) — jamais exposé.
        self.assertNotIn('code', response.data[0])
