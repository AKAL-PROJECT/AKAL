"""
Vues API REST (DRF) de l'app messaging — F05 (messagerie interne, polling).

    GET  /api/conversations/                 → Inbox de l'utilisateur connecté
    POST /api/conversations/                 → Démarre un contact (get-or-create + 1er message)
    GET  /api/conversations/<uuid:id>/       → Résumé d'un fil (annonce, autre participant)
    GET  /api/conversations/<uuid:id>/messages/ → Historique d'un fil, marque lu automatiquement
    POST /api/conversations/<uuid:id>/messages/ → Répond dans un fil déjà ouvert

ConversationDetailAPIView (résumé par id) est un ajout post-commit initial
F05 : nécessaire pour l'en-tête de la vue thread côté front (savoir de quelle
annonce / avec qui, sans reparcourir toute la liste paginée pour retrouver un
id) — découvert seulement en construisant le consommateur front, comme pour
les endpoints geo pendant F03.

Pas de WebSocket dans ce MVP (décision F05) : les GET sont conçus pour
être interrogés en polling périodique côté front, pas de push serveur.

Le marquage lu est un effet de bord du GET messages/ (décision F05 du
2026-07-28, assumé délibérément malgré l'entorse à la sémantique REST
stricte) : consulter un fil marque comme lus tous les messages de l'autre
participant, pas d'endpoint dédié.
"""

from django.db.models import Q
from rest_framework import generics, permissions
from rest_framework.exceptions import NotFound

from .models import Conversation, Message
from .serializers import (
    ConversationListSerializer,
    EnvoyerMessageSerializer,
    EnvoyerReponseSerializer,
    MessageSerializer,
)


def _conversations_de(utilisateur):
    """Fils où l'utilisateur est soit l'initiateur, soit le propriétaire de l'annonce."""
    return Conversation.objects.filter(
        Q(initiateur=utilisateur) | Q(annonce__proprietaire=utilisateur)
    ).distinct()


class ConversationListCreateAPIView(generics.ListCreateAPIView):
    """
    GET  /api/conversations/ → Inbox (les deux rôles confondus), triée par activité récente.
    POST /api/conversations/ → Démarre un contact — réservé à l'initiateur (cf.
        EnvoyerMessageSerializer, auto-contact refusé). Pour répondre dans un
        fil déjà ouvert, voir ConversationMessagesAPIView ci-dessous.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        return EnvoyerMessageSerializer if self.request.method == 'POST' else ConversationListSerializer

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Conversation.objects.none()
        return (
            _conversations_de(self.request.user)
            .select_related('annonce', 'annonce__proprietaire', 'initiateur')
            .prefetch_related('messages', 'annonce__photos')
            .order_by('-updated_at')
        )


class ConversationDetailAPIView(generics.RetrieveAPIView):
    """GET /api/conversations/<uuid:id>/ → Résumé d'un fil (même forme que la liste)."""

    serializer_class = ConversationListSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_url_kwarg = 'conversation_id'

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Conversation.objects.none()
        return (
            _conversations_de(self.request.user)
            .select_related('annonce', 'annonce__proprietaire', 'initiateur')
            .prefetch_related('messages', 'annonce__photos')
        )


class ConversationMessagesAPIView(generics.ListCreateAPIView):
    """
    GET  /api/conversations/<uuid:id>/messages/ → Historique complet (non paginé —
        volumétrie attendue faible par fil pour ce MVP), marque comme lus les
        messages de l'autre participant à chaque consultation.
    POST /api/conversations/<uuid:id>/messages/ → Répond, utilisable par les
        deux participants (contrairement à POST /api/conversations/).
    """

    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_conversation(self):
        # Scoping par queryset (comme AnnonceUpdateAPIView) : un fil auquel
        # l'utilisateur ne participe pas n'existe simplement pas de son
        # point de vue → 404, jamais 403.
        if not hasattr(self, '_conversation'):
            try:
                self._conversation = _conversations_de(self.request.user).select_related(
                    'annonce', 'annonce__proprietaire', 'initiateur',
                ).get(pk=self.kwargs['conversation_id'])
            except Conversation.DoesNotExist:
                raise NotFound()
        return self._conversation

    def get_serializer_class(self):
        return EnvoyerReponseSerializer if self.request.method == 'POST' else MessageSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['conversation'] = self.get_conversation()
        return context

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Message.objects.none()
        return Message.objects.filter(conversation_id=self.get_conversation().id)

    def list(self, request, *args, **kwargs):
        conversation = self.get_conversation()
        Message.objects.filter(conversation=conversation, is_lu=False).exclude(
            auteur=request.user
        ).update(is_lu=True)
        return super().list(request, *args, **kwargs)
