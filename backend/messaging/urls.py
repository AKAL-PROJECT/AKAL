"""
Routes API REST (DRF) de l'app messaging.

    GET  /api/favoris/         → Favoris de l'utilisateur courant
    POST /api/favoris/toggle/  → Ajoute/retire une annonce des favoris
"""

from django.urls import path

from .api_views import FavoriListAPIView, FavoriToggleAPIView

app_name = 'messaging-api'

urlpatterns = [
    path('', FavoriListAPIView.as_view(), name='list'),
    path('toggle/', FavoriToggleAPIView.as_view(), name='toggle'),
]
