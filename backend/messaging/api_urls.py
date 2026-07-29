"""
Routes API REST (DRF) de l'app messaging — F05.

    /api/conversations/                    → GET inbox, POST démarrer un contact
    /api/conversations/<uuid:id>/          → GET résumé d'un fil
    /api/conversations/<uuid:id>/messages/ → GET historique (+ marque lu), POST répondre
"""

from django.urls import path

from .api_views import (
    ConversationDetailAPIView,
    ConversationListCreateAPIView,
    ConversationMessagesAPIView,
)

app_name = 'messaging-api'

urlpatterns = [
    path('', ConversationListCreateAPIView.as_view(), name='list-create'),
    path('<uuid:conversation_id>/', ConversationDetailAPIView.as_view(), name='detail'),
    path('<uuid:conversation_id>/messages/', ConversationMessagesAPIView.as_view(), name='messages'),
]
