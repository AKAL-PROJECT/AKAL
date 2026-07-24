# pyrefly: ignore [missing-import]
from django.conf import settings
from django.middleware.csrf import CsrfViewMiddleware
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


def enforce_csrf(request):
    """Vérifie le CSRF double-submit (cookie `csrftoken` vs header `X-CSRFToken`).

    DRF ne déclenche cette vérification que pour `SessionAuthentication` ;
    comme l'auth JWT par cookie contourne ce garde-fou par défaut, on
    réutilise directement le middleware CSRF de Django là où c'est
    nécessaire (cf. docs/plans/2026-07-24-auth-module-design.md).
    """
    check = CsrfViewMiddleware(lambda r: None)
    check.process_request(request)
    reason = check.process_view(request, None, (), {})
    if reason:
        raise exceptions.PermissionDenied(f'Échec CSRF : {reason}')


class CookieJWTAuthentication(JWTAuthentication):
    """Authentification JWT lisant l'access token depuis un cookie httpOnly
    plutôt que le header ``Authorization`` (non supporté nativement par
    simplejwt)."""

    def authenticate(self, request):
        raw_token = request.COOKIES.get(settings.SIMPLE_JWT['AUTH_COOKIE_ACCESS'])
        if raw_token is None:
            return None

        try:
            validated_token = self.get_validated_token(raw_token)
        except (InvalidToken, TokenError):
            # Cookie absent/expiré/invalide -> traité comme non authentifié
            # (pas d'erreur dure) : les endpoints AllowAny (signup/login)
            # doivent rester utilisables malgré un cookie access périmé, et
            # les endpoints protégés retombent proprement sur le 401 de
            # IsAuthenticated plutôt qu'une exception d'authentification.
            return None

        user = self.get_user(validated_token)

        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            enforce_csrf(request)

        return user, validated_token
