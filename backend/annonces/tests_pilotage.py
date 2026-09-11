"""
Tests du tableau de bord de pilotage (akal/pilotage.py).

Vivent dans annonces/ (app installée, donc couverte par la découverte de
tests de ``manage.py test``) plutôt que dans ``akal/`` : ``akal`` n'est pas
une app Django (cf. docstring de akal/pilotage.py), son contenu n'est
jamais scanné par le lanceur de tests. Le nom de fichier (``tests_*.py``,
pas ``tests.py``) évite de faire grossir encore annonces/tests.py pour une
vue qui n'est pas vraiment une fonctionnalité de cette app — juste hébergée
ici pour des raisons de découverte.
"""

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from agriscore.models import StatistiquePasseport
from akal.pilotage import _barres, _pourcentage
from annonces.models import Annonce, Parcelle, StatistiqueAnnonce
from messaging.models import Conversation, Favori

User = get_user_model()


class FonctionsPuresTests(TestCase):
    """_pourcentage / _barres — aucune DB, testées isolément du reste."""

    def test_pourcentage_calcule(self):
        self.assertEqual(_pourcentage(25, 200), 12.5)

    def test_pourcentage_denominateur_nul_ne_leve_pas(self):
        self.assertEqual(_pourcentage(3, 0), 0.0)

    def test_barres_pct_relatif_au_maximum(self):
        lignes = [{'label': 'a', 'count': 10}, {'label': 'b', 'count': 5}, {'label': 'c', 'count': 0}]
        resultat = _barres(lignes)
        self.assertEqual([l['pct'] for l in resultat], [100, 50, 0])
        # count d'origine préservé, pas seulement pct ajouté.
        self.assertEqual([l['count'] for l in resultat], [10, 5, 0])

    def test_barres_toutes_a_zero_ne_divise_pas_par_zero(self):
        lignes = [{'label': 'a', 'count': 0}, {'label': 'b', 'count': 0}]
        resultat = _barres(lignes)
        self.assertEqual([l['pct'] for l in resultat], [0, 0])

    def test_barres_liste_vide(self):
        self.assertEqual(_barres([]), [])


class TableauDeBordAccesTests(TestCase):
    """Accès réservé au staff — même session que Django Admin."""

    def setUp(self):
        self.url = reverse('pilotage')

    def test_anonyme_redirige_vers_la_connexion_admin(self):
        reponse = self.client.get(self.url)
        self.assertEqual(reponse.status_code, 302)
        self.assertIn('/admin/login/', reponse.url)

    def test_utilisateur_authentifie_non_staff_redirige(self):
        u = User.objects.create_user(
            email='visiteur@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='V', prenom='I', is_staff=False,
        )
        self.client.force_login(u)
        reponse = self.client.get(self.url)
        self.assertEqual(reponse.status_code, 302)

    def test_staff_accede(self):
        staff = User.objects.create_user(
            email='staff@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='S', prenom='T', is_staff=True,
        )
        self.client.force_login(staff)
        reponse = self.client.get(self.url)
        self.assertEqual(reponse.status_code, 200)
        self.assertContains(reponse, 'Pilotage AKAL')


class TableauDeBordDonneesTests(TestCase):
    """Les chiffres affichés reflètent réellement la base — via
    response.context, jamais un parsing du HTML rendu."""

    def setUp(self):
        self.url = reverse('pilotage')
        self.staff = User.objects.create_user(
            email='staff@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='S', prenom='T', is_staff=True,
        )
        self.client.force_login(self.staff)
        self.vendeur = User.objects.create_user(
            email='vendeur.pilotage@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='V', prenom='E',
        )

    def _annonce_en_ligne(self, **overrides):
        parcelle = Parcelle.objects.create(surface_ha=3.0)
        defaults = {
            'parcelle': parcelle, 'proprietaire': self.vendeur, 'titre': 'T',
            'description': 'd', 'prix_mad': 100000, 'statut': 'en_ligne',
        }
        return Annonce.objects.create(**{**defaults, **overrides})

    def test_utilisateurs_actifs_ne_compte_que_les_connexions_recentes(self):
        actif = User.objects.create_user(
            email='actif@akal.ma', password='x', nom='A', prenom='C',
            last_login=timezone.now() - timedelta(days=2),
        )
        inactif = User.objects.create_user(
            email='inactif@akal.ma', password='x', nom='I', prenom='N',
            last_login=timezone.now() - timedelta(days=90),
        )
        jamais_connecte = User.objects.create_user(email='jamais@akal.ma', password='x', nom='J', prenom='C')

        reponse = self.client.get(self.url)
        kpi = next(k for k in reponse.context['kpis'] if 'Utilisateurs actifs' in k['label'])

        # `actif` + self.staff : force_login() (setUp) déclenche le signal
        # user_logged_in de Django, qui met à jour last_login — self.staff
        # compte donc lui aussi comme actif ici, ce n'est pas un artefact de
        # ce test. self.vendeur (jamais connecté via le client), inactif et
        # jamais_connecte ne comptent pas.
        self.assertEqual(kpi['valeur'], 2)

    def test_parcelles_publiees_compte_en_ligne_seulement(self):
        self._annonce_en_ligne()
        self._annonce_en_ligne()
        self._annonce_en_ligne(statut='brouillon')  # ne compte pas

        reponse = self.client.get(self.url)
        kpi = next(k for k in reponse.context['kpis'] if k['label'] == 'Parcelles publiées')
        self.assertEqual(kpi['valeur'], 2)

    def test_favoris_et_contacts_et_taux(self):
        a1 = self._annonce_en_ligne()
        Favori.objects.create(user=self.vendeur, annonce=a1)
        Favori.objects.create(user=self.staff, annonce=a1)
        Conversation.objects.create(annonce=a1, initiateur=self.staff)
        StatistiqueAnnonce.objects.create(annonce=a1, date=timezone.localdate(), vues=20)

        reponse = self.client.get(self.url)
        kpis = {k['label']: k['valeur'] for k in reponse.context['kpis']}

        self.assertEqual(kpis['Favoris'], 2)
        self.assertEqual(kpis['Contacts vendeurs'], 1)
        self.assertEqual(kpis['Consultations de fiches'], 20)
        # 1 conversation / 20 vues = 5.0 %
        self.assertEqual(kpis['Taux visite → contact'], '5.0 %')

    def test_taux_visite_contact_sans_vue_ne_plante_pas(self):
        reponse = self.client.get(self.url)
        kpis = {k['label']: k['valeur'] for k in reponse.context['kpis']}
        self.assertEqual(kpis['Taux visite → contact'], '0.0 %')

    def test_consultations_agriscore_somme_toutes_les_dates(self):
        StatistiquePasseport.objects.create(date=timezone.localdate(), compteur=4)
        StatistiquePasseport.objects.create(date=timezone.localdate() - timedelta(days=1), compteur=6)

        reponse = self.client.get(self.url)
        kpi = next(k for k in reponse.context['kpis'] if 'AgriScore' in k['label'])
        self.assertEqual(kpi['valeur'], 10)

    def test_statuts_chart_couvre_les_cinq_statuts_meme_a_zero(self):
        self._annonce_en_ligne()

        reponse = self.client.get(self.url)
        labels = {l['label'] for l in reponse.context['statuts_chart']}
        self.assertEqual(labels, {'Brouillon', 'En attente', 'En ligne', 'Archivée', 'Vendue'})

    @patch('akal.pilotage.stats_annonces_par_region')
    def test_regions_chart_triee_par_volume_decroissant(self, faux_stats):
        class FauxRegion:
            def __init__(self, nom):
                self.nom = nom

        faux_stats.return_value = [
            {'region': FauxRegion('Souss-Massa'), 'count': 3},
            {'region': FauxRegion('Fès-Meknès'), 'count': 9},
            {'region': FauxRegion('Oriental'), 'count': 0},
        ]

        reponse = self.client.get(self.url)

        self.assertEqual(
            [(l['label'], l['count'], l['pct']) for l in reponse.context['regions_chart']],
            [('Fès-Meknès', 9, 100), ('Souss-Massa', 3, 33), ('Oriental', 0, 0)],
        )
