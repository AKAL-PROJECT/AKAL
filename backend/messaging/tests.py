"""
Tests de l'app messaging — F05 (messagerie interne, polling) et Favoris.

Authentification réelle (signup + cookies), pas force_authenticate() —
même convention que accounts/tests.py et annonces/tests.py, pour les tests
de messagerie. Les tests Favoris (portés tels quels depuis leur branche
d'origine) utilisent force_authenticate() directement.
"""

from django.contrib.gis.geos import Point
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.models import User
from annonces.models import Annonce, Parcelle
from geo.models import Commune, Province, Region
from .models import Conversation, Favori

CONVERSATIONS_URL = '/api/conversations/'
FAVORIS_URL = '/api/favoris/'
TOGGLE_URL = '/api/favoris/toggle/'


# ──────────────────────────────────────────────
# Conversations / Messages (F05)
# ──────────────────────────────────────────────

class MessagingTestBase(APITestCase):
    def setUp(self):
        # DEFAULT_THROTTLE_RATES['login'] (5/min) est partagé entre tests
        # (même IP côté test client) : plusieurs tests de ce module font
        # plusieurs login/signup chacun, le cumul dépasse vite 5 sans ce
        # reset — même précaution que accounts/tests.py.
        cache.clear()
        self.client = APIClient(enforce_csrf_checks=True)

    def csrf_headers(self):
        token = self.client.cookies.get('csrftoken')
        return {'HTTP_X_CSRFTOKEN': token.value} if token else {}

    def authentifier(self, email):
        payload = {
            'email': email, 'password': 'un-mot-de-passe-solide-2026',
            'nom': 'Test', 'prenom': email.split('@')[0].capitalize(),
        }
        response = self.client.post('/api/auth/signup/', payload)
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return User.objects.get(email=email)

    def se_connecter(self, email):
        self.client.logout()
        self.client.post('/api/auth/login/', {'email': email, 'password': 'un-mot-de-passe-solide-2026'})

    def creer_annonce(self, proprietaire, statut=Annonce.StatutAnnonce.EN_LIGNE, titre='Belle parcelle'):
        parcelle = Parcelle.objects.create(
            surface_ha=2.5, statut_foncier='melkia', acces_eau='irriguee',
            topographie='plat', acces_routier='goudron',
        )
        return Annonce.objects.create(
            parcelle=parcelle, proprietaire=proprietaire, titre=titre,
            description='Une description suffisamment longue.', prix_mad=150000, statut=statut,
        )

    def messages_url(self, conversation_id):
        return f'{CONVERSATIONS_URL}{conversation_id}/messages/'


class DemarrerConversationTests(MessagingTestBase):
    def setUp(self):
        super().setUp()
        self.vendeur = self.authentifier('vendeur@akal.ma')
        self.client.logout()
        self.annonce = self.creer_annonce(self.vendeur)
        self.acheteur = self.authentifier('acheteur@akal.ma')

    def demarrer(self, contenu='Bonjour, ce terrain est-il toujours disponible ?'):
        return self.client.post(
            CONVERSATIONS_URL, {'annonce': str(self.annonce.id), 'contenu': contenu},
            format='json', **self.csrf_headers(),
        )

    def test_refuse_si_non_authentifie(self):
        self.client.logout()

        response = self.demarrer()

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cree_la_conversation_et_le_premier_message(self):
        response = self.demarrer('Bonjour !')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['dernier_message']['contenu'], 'Bonjour !')
        self.assertEqual(response.data['autre_participant']['prenom'], self.vendeur.prenom)
        self.assertEqual(response.data['messages_non_lus'], 0)  # 0 pour l'expéditeur lui-même

    def test_reutilise_la_conversation_existante_get_or_create(self):
        # Vérification explicite demandée : deux appels pour la même paire
        # (annonce, initiateur) ne créent jamais une deuxième ligne
        # Conversation — un seul fil, deux messages dedans.
        premiere = self.demarrer('Premier message')
        deuxieme = self.demarrer('Deuxième message')

        self.assertEqual(premiere.data['id'], deuxieme.data['id'])
        self.assertEqual(
            Conversation.objects.filter(annonce=self.annonce, initiateur=self.acheteur).count(), 1,
        )
        conversation_id = premiere.data['id']
        messages = self.client.get(self.messages_url(conversation_id), **self.csrf_headers())
        self.assertEqual(len(messages.data), 2)

    def test_auto_contact_interdit(self):
        self.se_connecter('vendeur@akal.ma')

        response = self.demarrer('Je me contacte moi-même')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('annonce', response.data)

    def test_annonce_brouillon_refusee(self):
        brouillon = self.creer_annonce(self.vendeur, statut=Annonce.StatutAnnonce.BROUILLON, titre='Brouillon')

        response = self.client.post(
            CONVERSATIONS_URL, {'annonce': str(brouillon.id), 'contenu': 'Bonjour'},
            format='json', **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_message_vide_refuse(self):
        response = self.demarrer('   ')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class InboxTests(MessagingTestBase):
    def setUp(self):
        super().setUp()
        self.vendeur = self.authentifier('vendeur@akal.ma')
        self.client.logout()
        self.annonce = self.creer_annonce(self.vendeur)
        self.acheteur = self.authentifier('acheteur@akal.ma')
        self.client.post(
            CONVERSATIONS_URL, {'annonce': str(self.annonce.id), 'contenu': 'Bonjour !'},
            format='json', **self.csrf_headers(),
        )

    def test_apparait_dans_inbox_acheteur_et_vendeur(self):
        response_acheteur = self.client.get(CONVERSATIONS_URL)
        self.assertEqual(len(response_acheteur.data['results']), 1)

        self.se_connecter('vendeur@akal.ma')
        response_vendeur = self.client.get(CONVERSATIONS_URL)
        self.assertEqual(len(response_vendeur.data['results']), 1)
        self.assertEqual(response_vendeur.data['results'][0]['autre_participant']['prenom'], self.acheteur.prenom)

    def test_messages_non_lus_du_point_de_vue_du_vendeur(self):
        self.se_connecter('vendeur@akal.ma')

        response = self.client.get(CONVERSATIONS_URL)

        self.assertEqual(response.data['results'][0]['messages_non_lus'], 1)

    def test_tri_par_activite_recente(self):
        autre_vendeur = self.authentifier('vendeur2@akal.ma')
        autre_annonce = self.creer_annonce(autre_vendeur, titre='Autre parcelle')
        self.se_connecter('acheteur@akal.ma')
        self.client.post(
            CONVERSATIONS_URL, {'annonce': str(autre_annonce.id), 'contenu': 'Intéressé aussi'},
            format='json', **self.csrf_headers(),
        )

        response = self.client.get(CONVERSATIONS_URL)

        # Le fil le plus récemment actif (autre_annonce) doit être en tête.
        self.assertEqual(response.data['results'][0]['annonce']['titre'], 'Autre parcelle')


class ConversationDetailTests(MessagingTestBase):
    def setUp(self):
        super().setUp()
        self.vendeur = self.authentifier('vendeur@akal.ma')
        self.client.logout()
        self.annonce = self.creer_annonce(self.vendeur)
        self.acheteur = self.authentifier('acheteur@akal.ma')
        demarrage = self.client.post(
            CONVERSATIONS_URL, {'annonce': str(self.annonce.id), 'contenu': 'Bonjour !'},
            format='json', **self.csrf_headers(),
        )
        self.conversation_id = demarrage.data['id']

    def test_participant_peut_lire_le_resume(self):
        response = self.client.get(f'{CONVERSATIONS_URL}{self.conversation_id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['annonce']['titre'], self.annonce.titre)
        self.assertEqual(response.data['autre_participant']['prenom'], self.vendeur.prenom)

    def test_tiers_non_participant_recoit_404(self):
        self.authentifier('tiers-detail@akal.ma')

        response = self.client.get(f'{CONVERSATIONS_URL}{self.conversation_id}/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class RepondreEtLireTests(MessagingTestBase):
    def setUp(self):
        super().setUp()
        self.vendeur = self.authentifier('vendeur@akal.ma')
        self.client.logout()
        self.annonce = self.creer_annonce(self.vendeur)
        self.acheteur = self.authentifier('acheteur@akal.ma')
        demarrage = self.client.post(
            CONVERSATIONS_URL, {'annonce': str(self.annonce.id), 'contenu': 'Bonjour !'},
            format='json', **self.csrf_headers(),
        )
        self.conversation_id = demarrage.data['id']

    def test_vendeur_peut_repondre_dans_le_fil(self):
        self.se_connecter('vendeur@akal.ma')

        response = self.client.post(
            self.messages_url(self.conversation_id), {'contenu': 'Oui, toujours disponible.'},
            format='json', **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['contenu'], 'Oui, toujours disponible.')

    def test_tiers_non_participant_recoit_404(self):
        self.authentifier('tiers@akal.ma')

        reponse = self.client.get(self.messages_url(self.conversation_id))
        envoi = self.client.post(
            self.messages_url(self.conversation_id), {'contenu': 'Je m\'incruste'},
            format='json', **self.csrf_headers(),
        )

        self.assertEqual(reponse.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(envoi.status_code, status.HTTP_404_NOT_FOUND)

    def test_consultation_marque_les_messages_lus(self):
        self.se_connecter('vendeur@akal.ma')

        avant = self.client.get(CONVERSATIONS_URL)
        self.assertEqual(avant.data['results'][0]['messages_non_lus'], 1)

        self.client.get(self.messages_url(self.conversation_id))

        apres = self.client.get(CONVERSATIONS_URL)
        self.assertEqual(apres.data['results'][0]['messages_non_lus'], 0)

    def test_consultation_ne_marque_pas_lus_ses_propres_messages(self):
        # L'acheteur consulte son propre fil juste après l'avoir envoyé —
        # son propre message ne doit pas passer is_lu=True par ce biais
        # (seuls les messages de l'autre participant sont concernés).
        response = self.client.get(self.messages_url(self.conversation_id))

        self.assertFalse(response.data[0]['is_lu'])

    def test_marquage_lu_ne_concerne_que_les_messages_recus(self):
        # Vérification explicite demandée : is_lu ne doit basculer que pour
        # les messages REÇUS par le lecteur, jamais pour les siens — même
        # dans un fil à deux messages où l'un des deux n'a encore été vu par
        # personne (le vendeur n'a pas relu le fil après sa propre réponse).
        self.se_connecter('vendeur@akal.ma')
        self.client.post(
            self.messages_url(self.conversation_id), {'contenu': 'Réponse du vendeur'},
            format='json', **self.csrf_headers(),
        )
        self.se_connecter('acheteur@akal.ma')

        response = self.client.get(self.messages_url(self.conversation_id))

        par_contenu = {m['contenu']: m for m in response.data}
        self.assertFalse(
            par_contenu['Bonjour !']['is_lu'],
            "le message de l'acheteur ne doit jamais être marqué lu par sa propre consultation",
        )
        self.assertTrue(
            par_contenu['Réponse du vendeur']['is_lu'],
            "le message du vendeur (reçu par l'acheteur) doit être marqué lu après cette consultation",
        )

    def test_ordre_chronologique_des_messages(self):
        self.se_connecter('vendeur@akal.ma')
        self.client.post(
            self.messages_url(self.conversation_id), {'contenu': 'Réponse du vendeur'},
            format='json', **self.csrf_headers(),
        )

        response = self.client.get(self.messages_url(self.conversation_id))

        contenus = [m['contenu'] for m in response.data]
        self.assertEqual(contenus, ['Bonjour !', 'Réponse du vendeur'])


# ──────────────────────────────────────────────
# Favoris
# ──────────────────────────────────────────────

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
