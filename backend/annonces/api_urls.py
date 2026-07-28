"""
Routes API REST (DRF) de l'app annonces.

    /api/annonces/              → GET liste paginée + filtres, POST création (F03)
    /api/annonces/<uuid:pk>/    → GET/PATCH brouillon par son propriétaire (F03)
    /api/annonces/<slug>/       → GET détail complet (public, en_ligne)

La route <uuid:pk>/ est déclarée AVANT <slug:slug>/ : un UUID est
syntaxiquement aussi un slug valide, Django résout dans l'ordre de
déclaration, donc l'ordre ici est significatif.
"""

from django.urls import path

from .api_views import (
    AnnonceDetailAPIView,
    AnnonceListCreateAPIView,
    AnnonceUpdateAPIView,
)

app_name = 'annonces-api'

urlpatterns = [
    path('', AnnonceListCreateAPIView.as_view(), name='list-create'),
    path('<uuid:pk>/', AnnonceUpdateAPIView.as_view(), name='update'),
    path('<slug:slug>/', AnnonceDetailAPIView.as_view(), name='detail'),
]
