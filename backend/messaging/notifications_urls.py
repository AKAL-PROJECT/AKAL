"""
Routes API REST (DRF) de l'app messaging — Notifications.

    GET   /api/notifications/                → Liste des notifications du destinataire connecté
    PATCH /api/notifications/<uuid:id>/      → Marquer comme lue/non lue
    POST  /api/notifications/mark-all-read/  → Marquer toutes comme lues

Fichier séparé de api_urls.py (conversations) et urls.py (favoris) — même
convention d'un fichier de routes par sous-fonctionnalité déjà en place dans
cette app.
"""

from django.urls import path

from .api_views import (
    NotificationListAPIView,
    NotificationMarkAllReadAPIView,
    NotificationMarkLuAPIView,
)

app_name = 'notifications-api'

urlpatterns = [
    path('', NotificationListAPIView.as_view(), name='list'),
    path('mark-all-read/', NotificationMarkAllReadAPIView.as_view(), name='mark-all-read'),
    path('<uuid:pk>/', NotificationMarkLuAPIView.as_view(), name='mark-lu'),
]
