"""
Routes API REST (DRF) de l'app annonces.

    /api/annonces/                                   → GET liste paginée + filtres, POST création (F03)
    /api/annonces/mes-annonces/                       → GET toutes les annonces du propriétaire connecté, tous statuts (dashboard)
    /api/annonces/<uuid:pk>/                          → GET/PATCH brouillon par son propriétaire (F03)
    /api/annonces/<uuid:annonce_id>/photos/<uuid:photo_id>/ → DELETE d'une photo de brouillon (F03)
    /api/annonces/<slug>/                             → GET détail complet (public, en_ligne)

La route <uuid:pk>/ est déclarée AVANT <slug:slug>/ : un UUID est
syntaxiquement aussi un slug valide, Django résout dans l'ordre de
déclaration, donc l'ordre ici est significatif. La route photos/ n'a pas
cette ambiguïté (forme à 3 segments, ne peut matcher ni <uuid:pk>/ ni
<slug:slug>/, tous deux à un seul segment) mais reste groupée ici par lisibilité.
mes-annonces/ est déclarée AVANT <slug:slug>/ pour la même raison — un slug
littéral "mes-annonces" resterait improbable mais la précaution est gratuite.
"""

from django.urls import path

from .api_views import (
    AnnonceDetailAPIView,
    AnnonceListCreateAPIView,
    AnnonceUpdateAPIView,
    MesAnnoncesListAPIView,
    PhotoDeleteAPIView,
)

app_name = 'annonces-api'

urlpatterns = [
    path('', AnnonceListCreateAPIView.as_view(), name='list-create'),
    path('mes-annonces/', MesAnnoncesListAPIView.as_view(), name='mes-annonces'),
    path('<uuid:pk>/', AnnonceUpdateAPIView.as_view(), name='update'),
    path('<uuid:annonce_id>/photos/<uuid:photo_id>/', PhotoDeleteAPIView.as_view(), name='photo-delete'),
    path('<slug:slug>/', AnnonceDetailAPIView.as_view(), name='detail'),
]
