"""
Routes API REST (DRF) de l'app accounts.

    POST /api/auth/signup/                  → Inscription
    POST /api/auth/login/                   → Connexion
    POST /api/auth/logout/                  → Déconnexion
    POST /api/auth/refresh/                 → Renouvellement de l'access token
    GET  /api/auth/me/                      → Utilisateur courant
    POST /api/auth/password-reset/          → Envoi du lien de réinitialisation
    POST /api/auth/password-reset/confirm/  → Application du nouveau mot de passe
"""

from django.urls import path

from .views import (
    LoginView,
    LogoutView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RefreshView,
    SignupView,
)

app_name = 'accounts-api'

urlpatterns = [
    path('signup/', SignupView.as_view(), name='signup'),
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('refresh/', RefreshView.as_view(), name='refresh'),
    path('me/', MeView.as_view(), name='me'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password-reset'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
]
