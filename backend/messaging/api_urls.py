"""
Routes API REST (DRF) de l'app messaging — F05.

    /api/conversations/                    → GET inbox, POST démarrer un contact
    /api/conversations/non-lues/           → GET total de messages non lus, toutes conversations
    /api/conversations/<uuid:id>/          → GET résumé d'un fil
    /api/conversations/<uuid:id>/messages/ → GET historique (+ marque lu), POST répondre

non-lues/ n'a pas besoin d'être déclarée avant <uuid:conversation_id>/ pour
éviter une collision (contrairement à annonces/api_urls.py et son
<slug:slug>/) : le convertisseur `uuid` de Django n'accepte que des chaînes
au format UUID, "non-lues" ne peut donc jamais le matcher — l'ordre est
néanmoins conservé par cohérence avec le reste du projet.
"""

from django.urls import path

from .api_views import (
    ConversationDetailAPIView,
    ConversationListCreateAPIView,
    ConversationMessagesAPIView,
    ConversationsNonLuesAPIView,
)

app_name = 'messaging-api'

urlpatterns = [
    path('', ConversationListCreateAPIView.as_view(), name='list-create'),
    path('non-lues/', ConversationsNonLuesAPIView.as_view(), name='non-lues'),
    path('<uuid:conversation_id>/', ConversationDetailAPIView.as_view(), name='detail'),
    path('<uuid:conversation_id>/messages/', ConversationMessagesAPIView.as_view(), name='messages'),
]
