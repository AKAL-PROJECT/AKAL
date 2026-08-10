from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.core.cache import cache
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
