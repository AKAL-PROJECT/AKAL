"""
Tests de l'app geo — référentiel régions/provinces/communes.

provinces/ et communes/ sont un ajout hors périmètre F03 (cf. décision du
2026-07-28, api_views.py) : construits par nécessité de test pour le
formulaire de dépôt d'annonce, à faire relire par Ibrahim (propriétaire
normal de ce module).

Référentiel géométrique officiel (2026-08-06, cf. docs/plans) : les tests
sur la commande d'import exercent la LOGIQUE (parsing, validations,
résolution spatiale, idempotence) sur des fixtures synthétiques légères —
jamais les vrais shapefiles (1536 features, trop lent pour la suite de
tests ; l'import réel a été vérifié manuellement, cf. docs/plans).
"""

from django.contrib.gis.geos import MultiPolygon, Point, Polygon
from django.core.management import CommandError
from django.test import SimpleTestCase, TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from .management.commands.import_geo_officiel import Command as ImportCommand
from .models import Commune, CommuneGeom, Province, ProvinceGeom, Region, RegionOfficielle


def _polygone_carre(centre_lon, centre_lat, demi_cote=0.1):
    """Petit carré MultiPolygon srid=4326 autour d'un centre — fixture de
    test, pas une vraie frontière administrative."""
    x0, y0 = centre_lon - demi_cote, centre_lat - demi_cote
    x1, y1 = centre_lon + demi_cote, centre_lat + demi_cote
    return MultiPolygon(Polygon(((x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0))), srid=4326)


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


# ──────────────────────────────────────────────
# Référentiel géométrique officiel (2026-08-06)
# ──────────────────────────────────────────────

class GeoOfficielTestBase(APITestCase):
    def setUp(self):
        self.region_1 = RegionOfficielle.objects.create(code=3, slug='fes-meknes', nom='Fès-Meknès')
        self.region_2 = RegionOfficielle.objects.create(code=6, slug='casablanca-settat', nom='Casablanca-Settat')
        self.province_1 = ProvinceGeom.objects.create(
            iso='MA-03-131', nom='Meknès', region=self.region_1, geom=_polygone_carre(-5.5, 33.5),
        )
        self.province_2 = ProvinceGeom.objects.create(
            iso='MA-06-030', nom='Nouaceur', region=self.region_2, geom=_polygone_carre(-7.6, 33.4),
        )
        self.commune_1 = CommuneGeom.objects.create(
            source_fid=1, libelle='MU MEKNES VILLE', nom_affichage='Meknès Ville', type_commune='MU',
            province=self.province_1, geom=_polygone_carre(-5.5, 33.5, demi_cote=0.05),
        )
        self.commune_2 = CommuneGeom.objects.create(
            source_fid=2, libelle='Dar Bouazza', nom_affichage='Dar Bouazza', type_commune=None,
            province=self.province_2, geom=_polygone_carre(-7.6, 33.4, demi_cote=0.05),
        )


class RegionOfficielleListTests(GeoOfficielTestBase):
    def test_liste_non_paginee_ordonnee_par_code(self):
        response = self.client.get('/api/geo/limites/regions/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        self.assertEqual([r['code'] for r in response.data], [3, 6])
        self.assertNotIn('results', response.data)


class ProvinceGeomListTests(GeoOfficielTestBase):
    def test_sans_filtre_rejete_400(self):
        response = self.client.get('/api/geo/limites/provinces/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filtre_par_region_retourne_feature_collection(self):
        response = self.client.get('/api/geo/limites/provinces/', {'region': 'fes-meknes'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['type'], 'FeatureCollection')
        self.assertEqual(len(response.data['features']), 1)
        feature = response.data['features'][0]
        self.assertEqual(feature['properties']['nom'], 'Meknès')
        self.assertEqual(feature['properties']['region']['slug'], 'fes-meknes')

    def test_region_inconnue_retourne_collection_vide(self):
        response = self.client.get('/api/geo/limites/provinces/', {'region': 'introuvable'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['features'], [])


class CommuneGeomListTests(GeoOfficielTestBase):
    def test_sans_filtre_rejete_400(self):
        response = self.client.get('/api/geo/limites/communes/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filtre_par_province(self):
        response = self.client.get('/api/geo/limites/communes/', {'province': self.province_1.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['features']), 1)
        self.assertEqual(response.data['features'][0]['properties']['nom_affichage'], 'Meknès Ville')

    def test_filtre_par_region_traverse_les_provinces(self):
        response = self.client.get('/api/geo/limites/communes/', {'region': 'casablanca-settat'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['features']), 1)
        self.assertEqual(response.data['features'][0]['properties']['nom_affichage'], 'Dar Bouazza')

    def test_type_commune_null_si_non_marque_jamais_devine(self):
        response = self.client.get('/api/geo/limites/communes/', {'province': self.province_2.id})

        self.assertIsNone(response.data['features'][0]['properties']['type_commune'])

    def test_coordonnees_ordre_lon_lat(self):
        """
        Régression directe sur le point n°1 de cette collaboration (ordre
        des coordonnées GeoJSON) : le premier point du premier anneau doit
        tomber dans l'emprise du Maroc en lisant [0]=lon, [1]=lat — jamais
        l'inverse (le piège n°1 identifié dans l'audit cartographie initial).
        """
        response = self.client.get('/api/geo/limites/communes/', {'province': self.province_1.id})

        anneau = response.data['features'][0]['geometry']['coordinates'][0][0]
        lon, lat = anneau[0]
        self.assertTrue(-18 <= lon <= 0, f"lon={lon} hors emprise Maroc — inversion lon/lat suspectée")
        self.assertTrue(20 <= lat <= 37, f"lat={lat} hors emprise Maroc — inversion lon/lat suspectée")


class CommuneGeomDetailTests(GeoOfficielTestBase):
    """GET /api/geo/limites/communes/<id>/ (ajout 2026-08-07, pré-remplissage
    de la cascade région/province/commune en édition d'annonce)."""

    def test_retourne_une_feature_avec_province_et_region(self):
        response = self.client.get(f'/api/geo/limites/communes/{self.commune_1.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['type'], 'Feature')
        self.assertEqual(response.data['id'], self.commune_1.id)
        self.assertEqual(response.data['properties']['nom_affichage'], 'Meknès Ville')
        self.assertEqual(response.data['properties']['province']['id'], self.province_1.id)
        self.assertEqual(response.data['properties']['region']['slug'], 'fes-meknes')

    def test_id_inexistant_retourne_404(self):
        response = self.client.get('/api/geo/limites/communes/999999/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ──────────────────────────────────────────────
# Commande import_geo_officiel — logique pure (pas les vrais shapefiles)
# ──────────────────────────────────────────────

class ParserLibelleTests(SimpleTestCase):
    """Les comptes (638 CR / 93 MU / 75 (Mun.) / 730 sans marqueur) sont
    vérifiés sur les 1536 enregistrements réels — ici on teste seulement que
    chaque motif est reconnu correctement."""

    def test_prefixe_cr(self):
        self.assertEqual(ImportCommand._parser_libelle('CR IMLILI'), ('CR', 'Imlili'))

    def test_prefixe_mu(self):
        self.assertEqual(ImportCommand._parser_libelle('MU DAKHLA'), ('MU', 'Dakhla'))

    def test_suffixe_mun_avec_point(self):
        self.assertEqual(ImportCommand._parser_libelle('Biougra (Mun.)'), ('MU', 'Biougra'))

    def test_suffixe_mun_insensible_a_la_casse_et_au_point(self):
        self.assertEqual(ImportCommand._parser_libelle('Ait Baha (mun)'), ('MU', 'Ait Baha'))

    def test_sans_marqueur_type_none_jamais_devine(self):
        type_commune, nom = ImportCommand._parser_libelle('Ait Mzal')

        self.assertIsNone(type_commune)
        self.assertEqual(nom, 'Ait Mzal')


class NormaliserMultipolygonTests(SimpleTestCase):
    def test_polygon_promu_en_multipolygon(self):
        polygon = Polygon(((0, 0), (1, 0), (1, 1), (0, 1), (0, 0)))

        resultat = ImportCommand._normaliser_multipolygon(polygon, srid=4326)

        self.assertEqual(resultat.geom_type, 'MultiPolygon')
        self.assertEqual(resultat.srid, 4326)

    def test_multipolygon_inchange(self):
        mp = _polygone_carre(-5.5, 33.5)

        resultat = ImportCommand._normaliser_multipolygon(mp, srid=4326)

        self.assertEqual(resultat.geom_type, 'MultiPolygon')


class VerifierEmpriseMarocTests(SimpleTestCase):
    def test_point_dans_lemprise_ne_leve_pas(self):
        ImportCommand._verifier_emprise_maroc(Point(-6.8, 34.0, srid=4326), 'test')  # Rabat

    def test_point_hors_emprise_leve(self):
        with self.assertRaises(CommandError):
            ImportCommand._verifier_emprise_maroc(Point(34.0, -6.8, srid=4326), 'test')  # lon/lat inversés


class VerifierAirePlausibleTests(SimpleTestCase):
    def test_aire_plausible_ne_leve_pas(self):
        ImportCommand._verifier_aire_plausible(_polygone_carre(-5.5, 33.5, demi_cote=0.05), 'test')

    def test_aire_minuscule_leve(self):
        minuscule = MultiPolygon(Polygon((
            (-5.5, 33.5), (-5.499999, 33.5), (-5.499999, 33.500001), (-5.5, 33.500001), (-5.5, 33.5),
        )), srid=4326)
        with self.assertRaises(CommandError):
            ImportCommand._verifier_aire_plausible(minuscule, 'test')


class ResoudreProvinceTests(TestCase):
    """Cascade ST_Within -> ST_Intersects -> plus proche sous tolérance."""

    def setUp(self):
        self.region = RegionOfficielle.objects.create(code=3, slug='fes-meknes', nom='Fès-Meknès')
        self.province = ProvinceGeom.objects.create(
            iso='MA-03-131', nom='Meknès', region=self.region, geom=_polygone_carre(-5.5, 33.5),
        )
        self.commande = ImportCommand()
        geom_3857 = self.province.geom.clone()
        geom_3857.transform(3857)
        self.cache_3857 = [(self.province, geom_3857)]

    def test_point_dans_le_polygone_resolu_directement(self):
        province, distance = self.commande._resoudre_province(
            Point(-5.5, 33.5, srid=4326), self.cache_3857,
        )

        self.assertEqual(province, self.province)
        self.assertIsNone(distance)  # résolution exacte, pas de repli

    def test_point_proche_hors_polygone_resolu_par_repli(self):
        # Juste à l'extérieur du carré (0.1° de demi-côté) mais à quelques km.
        province, distance = self.commande._resoudre_province(
            Point(-5.5, 33.601, srid=4326), self.cache_3857,
        )

        self.assertEqual(province, self.province)
        self.assertIsNotNone(distance)

    def test_point_trop_loin_ne_resout_rien(self):
        province, distance = self.commande._resoudre_province(
            Point(-5.5, 40.0, srid=4326), self.cache_3857,  # ~700 km au nord
        )

        self.assertIsNone(province)
        self.assertIsNotNone(distance)


class ImportRegionsIdempotenceTests(TestCase):
    """`_importer_regions` sur le dict figé REGIONS_OFFICIELLES — la seule
    partie de l'import testable sans shapefile réel. L'idempotence complète
    (provinces/communes, jointure spatiale) a été vérifiée manuellement
    contre les vrais fichiers (run --dry-run puis run réel deux fois,
    comptes identiques à chaque fois) — cf. docs/plans."""

    def test_deux_appels_ne_creent_pas_de_doublons(self):
        commande = ImportCommand()

        commande._importer_regions()
        commande._importer_regions()

        self.assertEqual(RegionOfficielle.objects.count(), 12)
        self.assertEqual(RegionOfficielle.objects.get(code=3).slug, 'fes-meknes')
