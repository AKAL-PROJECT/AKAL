from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import User

SIGNUP_URL = '/api/auth/signup/'
LOGIN_URL = '/api/auth/login/'
LOGOUT_URL = '/api/auth/logout/'
REFRESH_URL = '/api/auth/refresh/'
ME_URL = '/api/auth/me/'


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
