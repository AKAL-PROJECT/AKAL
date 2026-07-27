"""
Vues API REST (DRF) de l'app accounts — comptes, sessions, JWT.

Endpoints (cf. docs/plans/2026-07-24-auth-module-design.md) :
    - POST /api/auth/signup/   → Crée le compte (VENDEUR/ACHETEUR), pose les cookies
    - POST /api/auth/login/    → Vérifie email+password, pose les cookies
    - POST /api/auth/logout/   → Blackliste le refresh token, efface les cookies
    - POST /api/auth/refresh/  → Réémet un access token (+ refresh tourné)
    - GET  /api/auth/me/       → Utilisateur courant
"""

# pyrefly: ignore [missing-import]
from django.conf import settings
from django.middleware.csrf import get_token
from rest_framework import exceptions, generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .authentication import enforce_csrf
from .serializers import LoginSerializer, SignupSerializer, UserSerializer


def _set_auth_cookies(response, access, refresh):
    jwt_settings = settings.SIMPLE_JWT
    response.set_cookie(
        jwt_settings['AUTH_COOKIE_ACCESS'],
        str(access),
        max_age=int(jwt_settings['ACCESS_TOKEN_LIFETIME'].total_seconds()),
        path='/',
        httponly=True,
        secure=jwt_settings['AUTH_COOKIE_SECURE'],
        samesite=jwt_settings['AUTH_COOKIE_SAMESITE'],
    )
    response.set_cookie(
        jwt_settings['AUTH_COOKIE_REFRESH'],
        str(refresh),
        max_age=int(jwt_settings['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        path=jwt_settings['AUTH_COOKIE_REFRESH_PATH'],
        httponly=True,
        secure=jwt_settings['AUTH_COOKIE_SECURE'],
        samesite=jwt_settings['AUTH_COOKIE_SAMESITE'],
    )


def _clear_auth_cookies(response):
    jwt_settings = settings.SIMPLE_JWT
    response.delete_cookie(jwt_settings['AUTH_COOKIE_ACCESS'], path='/')
    response.delete_cookie(jwt_settings['AUTH_COOKIE_REFRESH'], path=jwt_settings['AUTH_COOKIE_REFRESH_PATH'])


class SignupView(generics.CreateAPIView):
    """Inscription publique. Rôle limité à VENDEUR/ACHETEUR (cf. serializer)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = SignupSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)
        response = Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
        _set_auth_cookies(response, refresh.access_token, refresh)
        get_token(request)  # force l'émission du cookie csrftoken
        return response


class LoginView(APIView):
    """Connexion par email + mot de passe."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']

        refresh = RefreshToken.for_user(user)
        response = Response(UserSerializer(user).data, status=status.HTTP_200_OK)
        _set_auth_cookies(response, refresh.access_token, refresh)
        get_token(request)  # force l'émission du cookie csrftoken
        return response


class LogoutView(APIView):
    """Déconnexion : blackliste le refresh token courant, efface les cookies."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH'])
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass  # déjà invalide/expiré : rien à blacklister

        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_auth_cookies(response)
        return response


class RefreshView(APIView):
    """Réémet un access token à partir du refresh token en cookie.

    Le refresh token est lu et validé manuellement ici (pas via
    CookieJWTAuthentication, qui ne lit que le cookie access — justement
    périmé quand on appelle /refresh). On garde volontairement
    l'authenticator par défaut : sans lui, une NotAuthenticated levée
    manuellement plus bas se retrouve dégradée en 403 par DRF (pas de
    WWW-Authenticate à produire).
    """

    permission_classes = [AllowAny]

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH'])
        if raw_refresh is None:
            raise exceptions.NotAuthenticated('Session expirée.')

        enforce_csrf(request)

        serializer = TokenRefreshSerializer(data={'refresh': raw_refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            # TokenRefreshSerializer laisse fuiter les TokenError bruts
            # (token blacklisté/expiré/invalide) au lieu de les envelopper :
            # même traitement que TokenViewBase.post() dans simplejwt.
            raise InvalidToken(e.args[0]) from e

        access = serializer.validated_data['access']
        new_refresh = serializer.validated_data.get('refresh', raw_refresh)

        response = Response(status=status.HTTP_204_NO_CONTENT)
        _set_auth_cookies(response, access, new_refresh)
        return response


class MeView(generics.RetrieveAPIView):
    """Utilisateur courant."""

    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user
