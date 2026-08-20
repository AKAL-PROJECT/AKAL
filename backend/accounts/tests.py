from unittest.mock import patch

from axes.utils import reset as axes_reset
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.core.cache import cache
from django.test import Client, TestCase, override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import User

SIGNUP_URL = '/api/auth/signup/'
LOGIN_URL = '/api/auth/login/'
LOGOUT_URL = '/api/auth/logout/'
REFRESH_URL = '/api/auth/refresh/'
ME_URL = '/api/auth/me/'
PASSWORD_RESET_URL = '/api/auth/password-reset/'
PASSWORD_RESET_CONFIRM_URL = '/api/auth/password-reset/confirm/'


class AuthTestCase(APITestCase):
    def setUp(self):
        # DEFAULT_THROTTLE_RATES['login'] est partagé entre tests (même
        # adresse IP côté test client) : on repart d'un cache propre à
        # chaque test pour ne pas déclencher le throttle par accident.
        cache.clear()
        # Le client de test DRF n'applique pas le CSRF par défaut
        # (enforce_csrf_checks=False) : on l'active pour vérifier que
        # enforce_csrf() protège vraiment /logout et /refresh.
        self.client = APIClient(enforce_csrf_checks=True)
        self.credentials = {
            'email': 'vendeur@akal.ma',
            'password': 'un-mot-de-passe-solide-2026',
            'nom': 'El Fassi',
            'prenom': 'Ahmed',
        }

    def csrf_headers(self):
        token = self.client.cookies['csrftoken'].value
        self.client.cookies['csrftoken'] = token
        return {'HTTP_X_CSRFTOKEN': token}


class SignupTests(AuthTestCase):
    def test_signup_creates_user_and_sets_cookies(self):
        response = self.client.post(SIGNUP_URL, self.credentials)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['email'], self.credentials['email'])
        self.assertEqual(response.data['role'], '')
        self.assertIn('access_token', response.cookies)
        self.assertIn('refresh_token', response.cookies)
        self.assertTrue(response.cookies['access_token']['httponly'])
        self.assertTrue(User.objects.filter(email=self.credentials['email']).exists())

    def test_signup_rejects_duplicate_email(self):
        self.client.post(SIGNUP_URL, self.credentials)
        response = self.client.post(SIGNUP_URL, self.credentials)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_signup_ignores_role_field_if_provided(self):
        # Pas de rôle à l'inscription (cf. design doc, addendum) : le champ
        # n'existe même pas sur le serializer, DRF l'ignore silencieusement.
        response = self.client.post(SIGNUP_URL, {**self.credentials, 'role': User.Role.ADMIN})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email=self.credentials['email'])
        self.assertEqual(user.role, '')

    def test_signup_rejects_weak_password(self):
        response = self.client.post(SIGNUP_URL, {**self.credentials, 'password': '1234'})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)


class SignupEmailDomaineReserveTests(AuthTestCase):
    """
    SignupSerializer.validate_email (audit final du 20/08, P3) — le domaine
    @tel.akal.local est réservé aux comptes créés par la connexion SMS
    (PhoneLoginVerifyView, accounts/auth_api_views.py) ; l'inscription
    classique ne doit jamais pouvoir le préempter.
    """

    def payload(self, email):
        return {**self.credentials, 'email': email}

    def test_email_normal_est_accepte(self):
        response = self.client.post(SIGNUP_URL, self.payload('normal@akal.ma'))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_domaine_reserve_est_rejete(self):
        response = self.client.post(SIGNUP_URL, self.payload('212612345678@tel.akal.local'))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)
        self.assertFalse(User.objects.filter(email='212612345678@tel.akal.local').exists())

    def test_domaine_reserve_est_rejete_quelle_que_soit_la_casse(self):
        response = self.client.post(SIGNUP_URL, self.payload('212612345678@TEL.AKAL.LOCAL'))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_domaine_qui_ressemble_mais_differe_reste_accepte(self):
        # Ne doit pas sur-bloquer un domaine qui contient juste la même
        # sous-chaîne — seule une correspondance exacte du domaine final est
        # rejetée (endswith('@tel.akal.local'), pas un simple "in").
        response = self.client.post(SIGNUP_URL, self.payload('contact@not-tel.akal.local.example.com'))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class LoginTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        User.objects.create_user(
            email=self.credentials['email'],
            password=self.credentials['password'],
            nom=self.credentials['nom'],
            prenom=self.credentials['prenom'],
        )

    def test_login_success_sets_cookies(self):
        response = self.client.post(LOGIN_URL, {
            'email': self.credentials['email'],
            'password': self.credentials['password'],
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access_token', response.cookies)
        self.assertIn('refresh_token', response.cookies)

    def test_login_wrong_password(self):
        response = self.client.post(LOGIN_URL, {
            'email': self.credentials['email'],
            'password': 'mauvais-mot-de-passe',
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn('access_token', response.cookies)

    def test_login_unknown_email(self):
        response = self.client.post(LOGIN_URL, {
            'email': 'inconnu@akal.ma',
            'password': 'peu-importe-2026',
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class MeTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        User.objects.create_user(
            email=self.credentials['email'],
            password=self.credentials['password'],
            nom=self.credentials['nom'],
            prenom=self.credentials['prenom'],
        )
        self.client.post(LOGIN_URL, {
            'email': self.credentials['email'],
            'password': self.credentials['password'],
        })

    def test_me_returns_current_user(self):
        response = self.client.get(ME_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], self.credentials['email'])

    def test_me_without_cookie_is_unauthorized(self):
        self.client.cookies.pop('access_token', None)
        response = self.client.get(ME_URL)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_with_garbage_cookie_is_unauthorized(self):
        self.client.cookies['access_token'] = 'ceci-nest-pas-un-jwt'
        response = self.client.get(ME_URL)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class RefreshTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        User.objects.create_user(
            email=self.credentials['email'],
            password=self.credentials['password'],
            nom=self.credentials['nom'],
            prenom=self.credentials['prenom'],
        )
        self.client.post(LOGIN_URL, {
            'email': self.credentials['email'],
            'password': self.credentials['password'],
        })

    def test_refresh_without_csrf_header_is_forbidden(self):
        response = self.client.post(REFRESH_URL)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_refresh_rotates_tokens(self):
        old_refresh = self.client.cookies['refresh_token'].value
        response = self.client.post(REFRESH_URL, **self.csrf_headers())

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertIn('access_token', response.cookies)
        self.assertIn('refresh_token', response.cookies)
        self.assertNotEqual(response.cookies['refresh_token'].value, old_refresh)

    def test_refresh_without_cookie_is_unauthorized(self):
        self.client.cookies.pop('refresh_token', None)
        response = self.client.post(REFRESH_URL, **self.csrf_headers())

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class LogoutTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        User.objects.create_user(
            email=self.credentials['email'],
            password=self.credentials['password'],
            nom=self.credentials['nom'],
            prenom=self.credentials['prenom'],
        )
        self.client.post(LOGIN_URL, {
            'email': self.credentials['email'],
            'password': self.credentials['password'],
        })

    def test_logout_clears_cookies_and_blacklists_refresh(self):
        old_refresh = self.client.cookies['refresh_token'].value
        response = self.client.post(LOGOUT_URL, **self.csrf_headers())

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(response.cookies['access_token'].value, '')
        self.assertEqual(response.cookies['refresh_token'].value, '')

        # Le refresh token blacklisté ne doit plus permettre de rafraîchir.
        self.client.cookies['refresh_token'] = old_refresh
        refresh_response = self.client.post(REFRESH_URL, **self.csrf_headers())
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_requires_authentication(self):
        self.client.cookies.pop('access_token', None)
        response = self.client.post(LOGOUT_URL, **self.csrf_headers())

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class LoginThrottleTests(AuthTestCase):
    def test_login_is_throttled_after_five_attempts(self):
        for _ in range(5):
            self.client.post(LOGIN_URL, {'email': 'x@akal.ma', 'password': 'wrong'})

        response = self.client.post(LOGIN_URL, {'email': 'x@akal.ma', 'password': 'wrong'})

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class SignupThrottleTests(AuthTestCase):
    """
    GET /api/auth/signup/ — scope 'signup' (5/hour), en plus du plancher
    global 'anon' (audit go-live du 2026-08-10). Même principe que
    LoginThrottleTests : peu importe que chaque tentative réussisse ou
    échoue (email dupliqué, validation...), toutes comptent pour le quota.
    """

    def payload(self, email='throttle-signup@akal.ma'):
        return {
            'email': email, 'password': 'un-mot-de-passe-solide-2026',
            'nom': 'Test', 'prenom': 'Throttle',
        }

    def test_signup_is_throttled_after_five_attempts(self):
        for _ in range(5):
            self.client.post(SIGNUP_URL, self.payload())

        response = self.client.post(SIGNUP_URL, self.payload())

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_throttle_isole_par_adresse_ip(self):
        # Épuise le quota d'une première IP...
        for _ in range(5):
            self.client.post(SIGNUP_URL, self.payload(), REMOTE_ADDR='10.0.0.1')
        epuise = self.client.post(SIGNUP_URL, self.payload(), REMOTE_ADDR='10.0.0.1')
        self.assertEqual(epuise.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # ... une deuxième IP n'a jamais consommé son propre quota : jamais
        # 429 pour elle, quel que soit l'état de la première (isolation).
        autre = self.client.post(
            SIGNUP_URL, self.payload(email='autre-ip@akal.ma'), REMOTE_ADDR='10.0.0.2',
        )
        self.assertNotEqual(autre.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_endpoint_public_reste_accessible_sous_la_limite(self):
        # Sanity check du plancher global 'anon' (1000/hour) : un petit
        # nombre de requêtes anonymes sur un endpoint public non scopé (ici
        # /api/auth/me/, qui ne dépend d'aucun état applicatif préalable)
        # ne doit jamais être bloqué — le throttle global est un filet
        # anti-abus grossier, pas une gêne pour un usage normal.
        for _ in range(5):
            response = self.client.get(ME_URL)
            self.assertNotEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class PasswordResetTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(
            email=self.credentials['email'],
            password=self.credentials['password'],
            nom=self.credentials['nom'],
            prenom=self.credentials['prenom'],
        )

    def test_request_sends_email_for_existing_user(self):
        response = self.client.post(PASSWORD_RESET_URL, {'email': self.credentials['email']})

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.credentials['email'], mail.outbox[0].to)
        self.assertIn('/reinitialiser-mot-de-passe?uid=', mail.outbox[0].body)

    def test_request_is_silent_for_unknown_email(self):
        # Même réponse que pour un email existant (cf. test ci-dessus) : ce
        # endpoint ne doit jamais permettre de deviner quels comptes existent.
        response = self.client.post(PASSWORD_RESET_URL, {'email': 'inconnu@akal.ma'})

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(len(mail.outbox), 0)

    def test_confirm_changes_password(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)

        response = self.client.post(PASSWORD_RESET_CONFIRM_URL, {
            'uid': uid,
            'token': token,
            'password': 'un-nouveau-mot-de-passe-2026',
        })

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('un-nouveau-mot-de-passe-2026'))

    def test_confirm_rejects_invalid_token(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))

        response = self.client.post(PASSWORD_RESET_CONFIRM_URL, {
            'uid': uid,
            'token': 'jeton-invalide',
            'password': 'un-nouveau-mot-de-passe-2026',
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.credentials['password']))

    def test_confirm_rejects_weak_password(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)

        response = self.client.post(PASSWORD_RESET_CONFIRM_URL, {
            'uid': uid,
            'token': token,
            'password': '1234',
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_confirm_token_is_single_use(self):
        # PasswordResetTokenGenerator encode le hash du mot de passe courant
        # dans le jeton : le changer invalide automatiquement toute réutilisation.
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)

        premiere = self.client.post(PASSWORD_RESET_CONFIRM_URL, {
            'uid': uid, 'token': token, 'password': 'un-premier-mot-de-passe-2026',
        })
        seconde = self.client.post(PASSWORD_RESET_CONFIRM_URL, {
            'uid': uid, 'token': token, 'password': 'un-second-mot-de-passe-2026',
        })

        self.assertEqual(premiere.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(seconde.status_code, status.HTTP_400_BAD_REQUEST)


class PasswordResetThrottleTests(AuthTestCase):
    def test_password_reset_is_throttled_after_three_attempts(self):
        for _ in range(3):
            self.client.post(PASSWORD_RESET_URL, {'email': 'x@akal.ma'})

        response = self.client.post(PASSWORD_RESET_URL, {'email': 'x@akal.ma'})

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class PhoneLoginTests(AuthTestCase):
    """
    POST /api/auth/phone/verify/ (audit final du 20/08, P3) —
    _get_firebase_auth() est mocké : ces tests ne dépendent jamais d'un vrai
    jeton Firebase/SMS.
    """

    PHONE_URL = '/api/auth/phone/verify/'

    def _mock_firebase(self, mock_get_auth, telephone='+212612345678'):
        mock_module = mock_get_auth.return_value
        mock_module.verify_id_token.return_value = {'phone_number': telephone}
        return mock_module

    @patch('accounts.auth_api_views._get_firebase_auth')
    def test_nouveau_numero_cree_un_compte_et_connecte(self, mock_get_auth):
        self._mock_firebase(mock_get_auth)

        response = self.client.post(self.PHONE_URL, {
            'token': 'un-jeton', 'prenom': 'Yasmine', 'nom': 'Alaoui',
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access_token', response.cookies)
        self.assertTrue(User.objects.filter(telephone='+212612345678').exists())

    @patch('accounts.auth_api_views._get_firebase_auth')
    def test_email_synthetique_deja_preempte_retourne_409_pas_400_generique(self, mock_get_auth):
        # Reproduit une collision déjà existante en base (ex. compte migré
        # depuis avant ce correctif) plutôt que de la provoquer via
        # /signup/ (désormais bloqué, cf. SignupEmailDomaineReserveTests) —
        # create_user() contourne volontairement SignupSerializer pour
        # recréer ce scénario précis.
        User.objects.create_user(
            email='212612345678@tel.akal.local', password='peu-importe-2026',
            nom='Intrus', prenom='Intrus',
        )
        self._mock_firebase(mock_get_auth, telephone='+212612345678')

        response = self.client.post(self.PHONE_URL, {'token': 'un-jeton'})

        # 409 explicite (cf. correction P3), jamais le 400 "Jeton invalide."
        # générique qui masquerait une vraie incohérence de données derrière
        # un message qui laisse croire à un problème côté utilisateur.
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        # Le vrai propriétaire du numéro n'a pas été rattaché au compte intrus.
        self.assertFalse(User.objects.filter(telephone='+212612345678').exists())

    @patch('accounts.auth_api_views._get_firebase_auth')
    def test_jeton_sans_numero_est_rejete(self, mock_get_auth):
        mock_module = mock_get_auth.return_value
        mock_module.verify_id_token.return_value = {}

        response = self.client.post(self.PHONE_URL, {'token': 'un-jeton'})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sans_token_est_rejete(self):
        response = self.client.post(self.PHONE_URL, {})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


@override_settings(GOOGLE_CLIENT_ID='un-client-id-de-test')
class GoogleLoginTests(AuthTestCase):
    """
    POST /api/auth/google/ (audit final du 20/08, P2) —
    id_token.verify_oauth2_token est mocké : ces tests ne dépendent jamais
    d'un appel réseau réel vers les serveurs Google.
    """

    GOOGLE_URL = '/api/auth/google/'

    def _idinfo(self, **overrides):
        base = {
            'email': 'nouveau.via.google@akal.ma',
            'email_verified': True,
            'given_name': 'Yasmine',
            'family_name': 'Google',
        }
        base.update(overrides)
        return base

    @patch('accounts.auth_api_views.id_token.verify_oauth2_token')
    def test_token_valide_email_verifie_connecte_normalement(self, mock_verify):
        mock_verify.return_value = self._idinfo()

        response = self.client.post(self.GOOGLE_URL, {'token': 'un-jeton-quelconque'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access_token', response.cookies)
        self.assertTrue(User.objects.filter(email='nouveau.via.google@akal.ma').exists())

    @patch('accounts.auth_api_views.id_token.verify_oauth2_token')
    def test_token_valide_email_non_verifie_est_refuse(self, mock_verify):
        # Cœur de la correction P2 : signature cryptographique valide mais
        # `email_verified: False` — ne doit jamais créer/connecter de compte.
        mock_verify.return_value = self._idinfo(email_verified=False)

        response = self.client.post(self.GOOGLE_URL, {'token': 'un-jeton-quelconque'})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn('access_token', response.cookies)
        self.assertFalse(User.objects.filter(email='nouveau.via.google@akal.ma').exists())

    @patch('accounts.auth_api_views.id_token.verify_oauth2_token')
    def test_email_verified_absent_du_jeton_est_traite_comme_non_verifie(self, mock_verify):
        # Un jeton qui omettrait purement et simplement la revendication (au
        # lieu de la poser explicitement à False) ne doit pas non plus passer
        # par défaut — .get() renvoie None, donc falsy, donc refusé.
        idinfo = self._idinfo()
        del idinfo['email_verified']
        mock_verify.return_value = idinfo

        response = self.client.post(self.GOOGLE_URL, {'token': 'un-jeton-quelconque'})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('accounts.auth_api_views.id_token.verify_oauth2_token')
    def test_jeton_invalide_est_rejete_comportement_inchange(self, mock_verify):
        mock_verify.side_effect = ValueError('jeton corrompu')

        response = self.client.post(self.GOOGLE_URL, {'token': 'un-jeton-invalide'})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(GOOGLE_CLIENT_ID='')
    def test_google_mal_configure_retourne_503_comportement_inchange(self):
        response = self.client.post(self.GOOGLE_URL, {'token': 'peu-importe'})

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_sans_token_est_rejete(self):
        response = self.client.post(self.GOOGLE_URL, {})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AdminAxesLockoutTests(TestCase):
    """
    django-axes sur /admin/login/ (audit final du 20/08, correction du P1
    sécurité admin) — cf. AXES_* dans akal/settings/base.py.

    Client Django standard (pas APIClient) : /admin/login/ est une vue
    Django classique, pas un endpoint DRF. AXES_ONLY_ADMIN_SITE=True limite
    strictement axes à /admin/ — LoginThrottleTests ci-dessus (endpoint JWT
    grand public) reste régi par son seul throttle DRF, jamais par axes ;
    aucune interférence entre les deux mécanismes n'est donc attendue ici.
    """

    ADMIN_LOGIN_URL = '/admin/login/'

    def setUp(self):
        self.admin_password = 'un-mot-de-passe-admin-2026'
        self.admin = User.objects.create_superuser(
            email='admin-axes@akal.ma', password=self.admin_password,
            nom='Admin', prenom='Test',
        )
        self.client = Client()

    def _tenter(self, password):
        return self.client.post(self.ADMIN_LOGIN_URL, {
            'username': self.admin.email,
            'password': password,
            'next': '/admin/',
        })

    def _session_authentifiee(self):
        return str(self.client.session.get('_auth_user_id')) == str(self.admin.pk)

    def test_tentative_normale_fonctionne(self):
        response = self._tenter(self.admin_password)

        # Succès admin classique : redirection (302) vers `next`, jamais un
        # nouveau rendu du formulaire de connexion.
        self.assertEqual(response.status_code, 302)
        self.assertTrue(self._session_authentifiee())

    def test_mauvais_mots_de_passe_repetes_declenchent_le_verrou(self):
        # AXES_FAILURE_LIMIT = 5 : les 5 premiers échecs sont traités
        # normalement (chacun refuse la connexion pour "mauvais mot de
        # passe"), le verrou se déclenche à partir de la 6ᵉ tentative —
        # même convention de comptage que LoginThrottleTests ci-dessus.
        for _ in range(5):
            echec = self._tenter('mauvais-mot-de-passe')
            self.assertFalse(self._session_authentifiee())
            self.assertNotEqual(echec.status_code, 302)

        # 6ᵉ tentative, cette fois avec le BON mot de passe : axes bloque
        # avant même que ModelBackend ne le vérifie. 429 (pas 403) : même
        # code que le throttling DRF existant (LoginThrottleTests) — vérifié
        # empiriquement, axes.middleware traduit son verrou en 429 dans ce
        # projet plutôt que le 403 générique documenté par le package.
        response = self._tenter(self.admin_password)

        self.assertFalse(self._session_authentifiee())
        self.assertContains(response, 'trop', status_code=429)

    def test_authentification_apres_deverrouillage_fonctionne(self):
        for _ in range(5):
            self._tenter('mauvais-mot-de-passe')
        verrouille = self._tenter(self.admin_password)
        self.assertFalse(self._session_authentifiee())
        self.assertEqual(verrouille.status_code, 429)

        # Déverrouillage — même opération que celle disponible en admin
        # (action "Reset" sur AccessAttempt, AXES_ENABLE_ADMIN=True) ou que
        # l'expiration naturelle d'AXES_COOLOFF_TIME (30 min) : ici appelée
        # directement via l'API publique du package plutôt que d'attendre
        # 30 minutes dans un test. AXES_LOCKOUT_PARAMETERS=['username',
        # 'ip_address'] suit les deux dimensions indépendamment (§AXES_* de
        # base.py) : le client de test n'ayant qu'une IP (127.0.0.1, défaut
        # Django), les DEUX enregistrements ont atteint la limite —
        # ip_or_username=True lève le verrou sur l'un OU l'autre en un seul
        # appel, pas seulement celui keyé par username.
        axes_reset(username=self.admin.email, ip='127.0.0.1', ip_or_username=True)

        response = self._tenter(self.admin_password)
        self.assertEqual(response.status_code, 302)
        self.assertTrue(self._session_authentifiee())

    def test_verrou_admin_naffecte_pas_la_connexion_jwt_grand_public(self):
        # AXES_ONLY_ADMIN_SITE=True : épuiser le quota axes sur /admin/login/
        # ne doit jamais toucher /api/auth/login/ (régi par son propre
        # throttle_scope 'login', cf. LoginThrottleTests) — deux mécanismes
        # indépendants, pas un seul verrou partagé par erreur de portée.
        for _ in range(6):
            self._tenter('mauvais-mot-de-passe')

        api_client = APIClient(enforce_csrf_checks=True)
        response = api_client.post(LOGIN_URL, {
            'email': self.admin.email,
            'password': self.admin_password,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
