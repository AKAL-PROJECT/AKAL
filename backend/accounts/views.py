"""
Vues API REST (DRF) de l'app accounts — comptes, sessions, JWT.

Endpoints (cf. docs/plans/2026-07-24-auth-module-design.md) :
    - POST /api/auth/signup/                  → Crée le compte (VENDEUR/ACHETEUR), pose les cookies
    - POST /api/auth/login/                    → Vérifie email+password, pose les cookies
    - POST /api/auth/logout/                   → Blackliste le refresh token, efface les cookies
    - POST /api/auth/refresh/                  → Réémet un access token (+ refresh tourné)
    - GET  /api/auth/me/                       → Utilisateur courant
    - POST /api/auth/password-reset/           → Envoie un lien de réinitialisation par email
    - POST /api/auth/password-reset/confirm/   → Applique le nouveau mot de passe
"""

# pyrefly: ignore [missing-import]
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.middleware.csrf import get_token
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import exceptions, generics, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .authentication import enforce_csrf
from .models import User
from .serializers import (
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    SignupSerializer,
    UserSerializer,
    UserUpdateSerializer,
)


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
    """
    Inscription publique. Rôle limité à VENDEUR/ACHETEUR (cf. serializer).

    Throttle (audit go-live du 2026-08-10) : AnonRateThrottle applique le
    plancher global ('anon'), ScopedRateThrottle applique en plus la limite
    serrée 'signup' — la création de compte est l'endpoint public en
    écriture le moins cher à abuser (aucune donnée requise hors email/mdp),
    donc le plus exposé à un script en boucle.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AnonRateThrottle, ScopedRateThrottle]
    throttle_scope = 'signup'
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


class MeView(generics.RetrieveUpdateAPIView):
    """Utilisateur courant. GET pour la lecture (UserSerializer, y compris
    `avatar` en URL absolue) ; PATCH pour l'édition de profil (page /compte,
    mission « avatar + téléphone ») — même endpoint, pas de route dédiée
    séparée, à l'image de AnnonceUpdateAPIView (annonces/api_views.py) qui
    combine déjà lecture/écriture y compris upload de fichier sur une seule
    vue.

    PUT n'a pas d'usage prévu ici (édition partielle uniquement) — retiré
    explicitement comme sur AnnonceUpdateAPIView, même raison.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        # UserUpdateSerializer valide/enregistre (telephone + avatar
        # uniquement) ; la réponse reste au format UserSerializer complet
        # (même forme que GET) — le frontend n'a qu'un seul type `User` à
        # gérer, jamais une forme partielle propre au PATCH.
        instance = self.get_object()
        serializer = UserUpdateSerializer(
            instance, data=request.data, partial=True, context=self.get_serializer_context()
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(instance, context=self.get_serializer_context()).data)


class PasswordResetRequestView(APIView):
    """Déclenche l'envoi du lien de réinitialisation.

    Répond 204 que l'email corresponde ou non à un compte existant — ne
    jamais laisser ce endpoint révéler quelles adresses sont enregistrées.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset'

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = User.objects.filter(email__iexact=serializer.validated_data['email']).first()
        if user is not None:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            lien = f"{settings.FRONTEND_URL}/reinitialiser-mot-de-passe?uid={uid}&token={token}"
            send_mail(
                subject='Réinitialisez votre mot de passe AKAL',
                message=(
                    f"Bonjour {user.prenom},\n\n"
                    "Une demande de réinitialisation de mot de passe a été faite pour ce compte. "
                    f"Cliquez sur ce lien pour choisir un nouveau mot de passe :\n{lien}\n\n"
                    "Pour des raisons de sécurité, ce lien est valable un temps limité. Si vous n'êtes "
                    "pas à l'origine de cette demande, ignorez simplement cet email."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
            )

        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetConfirmView(APIView):
    """Applique le nouveau mot de passe à partir du lien reçu par email."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset'

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)



