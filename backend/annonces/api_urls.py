"""
Routes API REST (DRF) de l'app annonces.

    /api/annonces/                                   → GET liste paginée + filtres, POST création (F03)
    /api/annonces/stats/regions/                      → GET nombre d'annonces en_ligne par région, sur tout le catalogue (Home, CouvertureSection.tsx)
    /api/annonces/mes-annonces/                       → GET toutes les annonces du propriétaire connecté, tous statuts (dashboard)
    /api/annonces/mes-annonces/statistiques/          → GET favoris/conversations reçus, messages non lus (dashboard)
    /api/annonces/<uuid:pk>/                          → GET/PATCH brouillon par son propriétaire (F03)
    /api/annonces/<uuid:pk>/whatsapp/                 → GET lien wa.me (authentifié + throttlé) — le numéro n'est plus dans le DTO public
    /api/annonces/<uuid:pk>/vue/                      → POST enregistre une vue de fiche (beacon anonyme, dédupliqué 24 h, throttlé)
    /api/annonces/<uuid:annonce_id>/photos/<uuid:photo_id>/ → DELETE d'une photo de brouillon (F03)
    /api/annonces/<slug>/                             → GET détail complet (public, en_ligne)

La route <uuid:pk>/ est déclarée AVANT <slug:slug>/ : un UUID est
syntaxiquement aussi un slug valide, Django résout dans l'ordre de
déclaration, donc l'ordre ici est significatif. La route photos/ n'a pas
cette ambiguïté (forme à 3 segments, ne peut matcher ni <uuid:pk>/ ni
<slug:slug>/, tous deux à un seul segment) mais reste groupée ici par lisibilité.
stats/regions/, mes-annonces/ et mes-annonces/statistiques/ sont déclarées
AVANT <slug:slug>/ pour la même raison — un slug littéral "stats" resterait
improbable mais la précaution est gratuite (toutes à 2 segments, donc déjà
hors de portée du convertisseur <slug:slug>/ à 1 segment).
"""

from django.urls import path

from .api_views import (
    AnnonceDetailAPIView,
    AnnonceListCreateAPIView,
    AnnonceStatsRegionAPIView,
    AnnonceUpdateAPIView,
    EnregistrerVueAPIView,
    MesAnnoncesListAPIView,
    MesStatistiquesAPIView,
    PhotoDeleteAPIView,
    RechercheSauvegardeeDetailAPIView,
    RechercheSauvegardeeListCreateAPIView,
    WhatsAppLienAPIView,
)

app_name = 'annonces-api'

urlpatterns = [
    path('', AnnonceListCreateAPIView.as_view(), name='list-create'),
    path('stats/regions/', AnnonceStatsRegionAPIView.as_view(), name='stats-regions'),
    path('mes-annonces/', MesAnnoncesListAPIView.as_view(), name='mes-annonces'),
    path('mes-annonces/statistiques/', MesStatistiquesAPIView.as_view(), name='mes-statistiques'),
    # Recherches sauvegardées (alertes, 2026-08-19) — déclarées avant
    # <uuid:pk>/ et <slug:slug>/ pour la même raison que stats/regions/ et
    # mes-annonces/ ci-dessus (toutes à 2 segments, hors de portée du
    # convertisseur <slug:slug>/ à 1 segment, mais la précaution reste
    # gratuite et cohérente avec le reste du fichier).
    path('recherches-sauvegardees/', RechercheSauvegardeeListCreateAPIView.as_view(), name='recherches-sauvegardees-list'),
    path('recherches-sauvegardees/<uuid:pk>/', RechercheSauvegardeeDetailAPIView.as_view(), name='recherches-sauvegardees-detail'),
    path('<uuid:pk>/', AnnonceUpdateAPIView.as_view(), name='update'),
    path('<uuid:pk>/whatsapp/', WhatsAppLienAPIView.as_view(), name='whatsapp'),
    path('<uuid:pk>/vue/', EnregistrerVueAPIView.as_view(), name='vue'),
    path('<uuid:annonce_id>/photos/<uuid:photo_id>/', PhotoDeleteAPIView.as_view(), name='photo-delete'),
    path('<slug:slug>/', AnnonceDetailAPIView.as_view(), name='detail'),
]
