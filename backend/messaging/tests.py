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
from .models import Conversation, Favori, Notification

CONVERSATIONS_URL = '/api/conversations/'
FAVORIS_URL = '/api/favoris/'
TOGGLE_URL = '/api/favoris/toggle/'
NOTIFICATIONS_URL = '/api/notifications/'
MARK_ALL_READ_URL = '/api/notifications/mark-all-read/'


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


class ConversationsNonLuesTests(MessagingTestBase):
    """
    GET /api/conversations/non-lues/ — cf. docstring ConversationsNonLuesAPIView
    (regression du 19/08 : le badge Navbar sommait jusque-là uniquement la
    première page paginée de l'inbox, cf. fetchNombreMessagesNonLus()).
    """

    NON_LUES_URL = '/api/conversations/non-lues/'

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

    def test_refuse_si_non_authentifie(self):
        self.client.logout()

        response = self.client.get(self.NON_LUES_URL)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_compte_du_point_de_vue_du_destinataire_pas_de_lexpediteur(self):
        # acheteur = expéditeur du seul message existant → 0 pour lui.
        response_acheteur = self.client.get(self.NON_LUES_URL)
        self.assertEqual(response_acheteur.data['messages_non_lus'], 0)

        # vendeur = destinataire → 1.
        self.se_connecter('vendeur@akal.ma')
        response_vendeur = self.client.get(self.NON_LUES_URL)
        self.assertEqual(response_vendeur.data['messages_non_lus'], 1)

    def test_compte_au_dela_de_la_premiere_page_de_linbox(self):
        """
        Régression : avant ce endpoint, le total était dérivé en sommant
        `messages_non_lus` sur la seule première page de GET /api/conversations/
        (PAGE_SIZE=12). Ce test construit délibérément plus de 12
        conversations pour le vendeur, LUES pour 13 d'entre elles (le
        vendeur les a ouvertes — GET .../messages/ marque lu, cf.
        ConversationMessagesAPIView.list()) — seul le fil créé dans setUp()
        (jamais ouvert par le vendeur) reste non lu, et se retrouve hors
        page 1 une fois les 13 autres, plus récemment actives, passées
        devant (tri -updated_at). La somme sur la page 1 donnerait 0,
        l'agrégat réel doit donner 1.
        """
        # Le fil déjà créé dans setUp() est le plus ancien (premier créé) —
        # jamais ouvert par le vendeur, reste donc non lu tout du long.
        conversation_ids = []
        for i in range(13):
            # scope 'signup' (5/hour, cf. settings.REST_FRAMEWORK) — sans ce
            # reset, la 6e itération échoue en 429 (même précaution que
            # setUp() ci-dessus, appliquée ici à chaque itération plutôt
            # qu'une seule fois : 13 vrais signups dans le même test).
            cache.clear()
            self.authentifier(f'acheteur{i}@akal.ma')
            reponse = self.client.post(
                CONVERSATIONS_URL, {'annonce': str(self.annonce.id), 'contenu': f'Message {i}'},
                format='json', **self.csrf_headers(),
            )
            conversation_ids.append(reponse.data['id'])
            self.client.logout()

        self.se_connecter('vendeur@akal.ma')
        # Le vendeur ouvre les 13 nouveaux fils — marque leurs messages lus
        # (effet de bord du GET, cf. ConversationMessagesAPIView.list()) et
        # les fait remonter en tête de l'inbox (tri -updated_at), poussant
        # le fil non lu de setUp() hors de la première page.
        for cid in conversation_ids:
            self.client.get(self.messages_url(cid), **self.csrf_headers())

        inbox = self.client.get(CONVERSATIONS_URL)
        titres_page_1 = [c['dernier_message']['contenu'] for c in inbox.data['results']]
        self.assertNotIn('Bonjour !', titres_page_1)  # confirme que le fil non lu est bien hors page 1

        response = self.client.get(self.NON_LUES_URL)
        self.assertEqual(response.data['messages_non_lus'], 1)


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

    def test_toggle_brouillon_dautrui_returns_404(self):
        # Audit du 2026-07-30 : un brouillon n'est visible que de son
        # propriétaire — le mettre en favori ne doit pas être possible même
        # en connaissant/devinant son UUID.
        proprietaire = User.objects.create_user(
            email='vendeur-brouillon@akal.ma', password='un-mot-de-passe-solide-2026',
            nom='Test', prenom='Vendeur',
        )
        parcelle = Parcelle.objects.create(
            surface_ha=3, statut_foncier=Parcelle.StatutFoncier.MELKIA,
            acces_eau=Parcelle.AccesEau.IRRIGUEE, topographie=Parcelle.Topographie.PLAT,
            acces_routier=Parcelle.AccesRoutier.GOUDRON,
        )
        brouillon = Annonce.objects.create(
            parcelle=parcelle, proprietaire=proprietaire, titre='Brouillon privé',
            description='Jamais publié.', prix_mad=100000,
            statut=Annonce.StatutAnnonce.BROUILLON,
        )
        self.client.force_authenticate(self.user)

        response = self.client.post(TOGGLE_URL, {'annonce': str(brouillon.id)})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(Favori.objects.filter(user=self.user, annonce=brouillon).exists())

    def test_toggle_retire_un_favori_meme_si_annonce_devenue_archivee(self):
        # Le filtre en_ligne() (test ci-dessus) ne doit s'appliquer qu'à
        # l'AJOUT — un favori déjà existant doit rester retirable même si
        # l'annonce a depuis été archivée/vendue, sinon il resterait
        # définitivement "coincé" dans la liste de l'utilisateur.
        self.client.force_authenticate(self.user)
        Favori.objects.create(user=self.user, annonce=self.annonce)
        self.annonce.statut = Annonce.StatutAnnonce.ARCHIVEE
        self.annonce.save(update_fields=['statut'])

        response = self.client.post(TOGGLE_URL, {'annonce': str(self.annonce.id)})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_favori'])
        self.assertFalse(Favori.objects.filter(user=self.user, annonce=self.annonce).exists())


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
        # `annonce` est nesté (AnnonceListSerializer) depuis l'ajout de la
        # page /favoris — plus un UUID brut, cf. FavoriSerializer.
        self.assertEqual(response.data[0]['annonce']['id'], str(self.annonce.id))
        self.assertEqual(response.data[0]['annonce']['titre'], self.annonce.titre)

    def test_list_empty_when_no_favoris(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(FAVORIS_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])


# ──────────────────────────────────────────────
# Notifications (signaux)
# ──────────────────────────────────────────────

class NotificationSignalsTests(MessagingTestBase):
    """Les signaux (messaging/signals.py) créent la bonne Notification, pour le bon destinataire."""

    def setUp(self):
        super().setUp()
        self.vendeur = self.authentifier('vendeur-notif@akal.ma')
        self.client.logout()
        self.annonce = self.creer_annonce(self.vendeur)
        self.acheteur = self.authentifier('acheteur-notif@akal.ma')

    def demarrer_conversation(self, contenu='Bonjour, toujours disponible ?'):
        return self.client.post(
            CONVERSATIONS_URL, {'annonce': str(self.annonce.id), 'contenu': contenu},
            format='json', **self.csrf_headers(),
        )

    def test_demarrer_une_conversation_notifie_le_vendeur_deux_fois(self):
        # Démarrer une conversation crée à la fois la Conversation ET le
        # premier Message → deux notifications distinctes pour le vendeur
        # (CONTACT_RECU puis NOUVEAU_MESSAGE) — comportement volontaire de
        # signals.py, pas un doublon accidentel (cf. sa docstring).
        self.demarrer_conversation('Bonjour !')

        notifs = list(Notification.objects.filter(destinataire=self.vendeur).order_by('created_at'))
        self.assertEqual(len(notifs), 2)
        self.assertEqual(notifs[0].type_notif, Notification.TypeNotif.CONTACT_RECU)
        self.assertEqual(notifs[1].type_notif, Notification.TypeNotif.NOUVEAU_MESSAGE)

    def test_repondre_dans_un_fil_existant_ne_notifie_quune_fois(self):
        self.demarrer_conversation('Premier message')
        conversation = Conversation.objects.get(annonce=self.annonce, initiateur=self.acheteur)
        Notification.objects.all().delete()  # isole l'effet de la réponse ci-dessous
        self.se_connecter('vendeur-notif@akal.ma')

        self.client.post(
            self.messages_url(conversation.id), {'contenu': 'Réponse du vendeur'},
            format='json', **self.csrf_headers(),
        )

        notifs = Notification.objects.filter(destinataire=self.acheteur)
        self.assertEqual(notifs.count(), 1)
        self.assertEqual(notifs.first().type_notif, Notification.TypeNotif.NOUVEAU_MESSAGE)

    def test_favori_notifie_le_proprietaire(self):
        self.client.force_authenticate(self.acheteur)

        self.client.post(TOGGLE_URL, {'annonce': str(self.annonce.id)})

        notifs = Notification.objects.filter(
            destinataire=self.vendeur, type_notif=Notification.TypeNotif.NOUVEAU_FAVORI,
        )
        self.assertEqual(notifs.count(), 1)

    def test_favori_sur_sa_propre_annonce_ne_notifie_personne(self):
        self.client.force_authenticate(self.vendeur)

        self.client.post(TOGGLE_URL, {'annonce': str(self.annonce.id)})

        self.assertFalse(Notification.objects.filter(type_notif=Notification.TypeNotif.NOUVEAU_FAVORI).exists())

    def test_retrait_dun_favori_ne_notifie_pas(self):
        self.client.force_authenticate(self.acheteur)
        self.client.post(TOGGLE_URL, {'annonce': str(self.annonce.id)})
        Notification.objects.all().delete()

        self.client.post(TOGGLE_URL, {'annonce': str(self.annonce.id)})  # retrait (toggle off)

        self.assertFalse(Notification.objects.filter(type_notif=Notification.TypeNotif.NOUVEAU_FAVORI).exists())


# ──────────────────────────────────────────────
# Notifications (API)
# ──────────────────────────────────────────────

class NotificationAPITests(MessagingTestBase):
    def setUp(self):
        super().setUp()
        self.vendeur = self.authentifier('vendeur-api-notif@akal.ma')
        self.client.logout()
        self.annonce = self.creer_annonce(self.vendeur)
        self.acheteur = self.authentifier('acheteur-api-notif@akal.ma')
        self.client.post(
            CONVERSATIONS_URL, {'annonce': str(self.annonce.id), 'contenu': 'Bonjour !'},
            format='json', **self.csrf_headers(),
        )
        # À ce stade, le vendeur a 2 notifications (contact_recu + nouveau_message),
        # l'acheteur aucune — client encore authentifié en tant qu'acheteur.

    def test_liste_requiert_authentification(self):
        self.client.logout()

        response = self.client.get(NOTIFICATIONS_URL)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_liste_ne_retourne_que_les_notifications_du_destinataire(self):
        self.se_connecter('vendeur-api-notif@akal.ma')

        response = self.client.get(NOTIFICATIONS_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_acheteur_ne_voit_aucune_notification_du_vendeur(self):
        response = self.client.get(NOTIFICATIONS_URL)  # toujours connecté en tant qu'acheteur

        self.assertEqual(response.data, [])

    def test_marquer_lue_scope_au_destinataire(self):
        self.se_connecter('vendeur-api-notif@akal.ma')
        notif = Notification.objects.filter(destinataire=self.vendeur).first()

        response = self.client.patch(
            f'{NOTIFICATIONS_URL}{notif.id}/', {'is_lu': True}, format='json', **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_lu'])
        notif.refresh_from_db()
        self.assertTrue(notif.is_lu)

    def test_marquer_lue_notification_dautrui_retourne_404(self):
        # Toujours connecté en tant qu'acheteur ici — la notification ciblée
        # appartient au vendeur.
        notif_du_vendeur = Notification.objects.filter(destinataire=self.vendeur).first()

        response = self.client.patch(
            f'{NOTIFICATIONS_URL}{notif_du_vendeur.id}/', {'is_lu': True}, format='json', **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_marquer_toutes_lues(self):
        self.se_connecter('vendeur-api-notif@akal.ma')

        response = self.client.post(MARK_ALL_READ_URL, **self.csrf_headers())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Notification.objects.filter(destinataire=self.vendeur, is_lu=False).count(), 0)

    def test_marquer_toutes_lues_requiert_authentification(self):
        self.client.logout()

        response = self.client.post(MARK_ALL_READ_URL)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ──────────────────────────────────────────────
# Throttling — message (audit go-live du 2026-08-10)
# ──────────────────────────────────────────────

class MessageThrottleTests(MessagingTestBase):
    """
    Scope 'message' (40/hour), partagé entre POST /api/conversations/
    (démarrer un contact) et POST .../messages/ (répondre) — même vecteur
    de spam. Testé ici via le premier, get_or_create() rend la répétition
    du même appel sûre (ajoute un message au même fil, ne recrée jamais de
    conversation, cf. EnvoyerMessageSerializer).
    """

    def setUp(self):
        super().setUp()
        self.vendeur = self.authentifier('vendeur-throttle@akal.ma')
        self.client.logout()
        self.annonce = self.creer_annonce(self.vendeur)
        self.acheteur = self.authentifier('acheteur-throttle@akal.ma')

    def demarrer(self):
        return self.client.post(
            CONVERSATIONS_URL, {'annonce': str(self.annonce.id), 'contenu': 'Bonjour !'},
            format='json', **self.csrf_headers(),
        )

    def test_throttled_after_forty_messages(self):
        for _ in range(40):
            self.demarrer()

        response = self.demarrer()

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_throttle_isole_par_utilisateur(self):
        for _ in range(40):
            self.demarrer()
        epuise = self.demarrer()
        self.assertEqual(epuise.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # Un deuxième acheteur, sur une autre annonce, n'a jamais consommé
        # son propre quota.
        self.client.logout()
        autre_vendeur = self.authentifier('vendeur-isolation@akal.ma')
        self.client.logout()
        autre_annonce = self.creer_annonce(autre_vendeur, titre='Autre parcelle')
        self.authentifier('acheteur-isolation@akal.ma')

        autre = self.client.post(
            CONVERSATIONS_URL, {'annonce': str(autre_annonce.id), 'contenu': 'Bonjour !'},
            format='json', **self.csrf_headers(),
        )
        self.assertNotEqual(autre.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
