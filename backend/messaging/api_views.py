"""
Vues API REST (DRF) de l'app messaging.

    GET  /api/favoris/         → Favoris de l'utilisateur courant
    POST /api/favoris/toggle/  → Ajoute/retire une annonce des favoris
"""

# pyrefly: ignore [missing-import]
from django.core.exceptions import ValidationError
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from annonces.models import Annonce
from .models import Favori
from .serializers import FavoriSerializer


class FavoriListAPIView(generics.ListAPIView):
    """
    GET /api/favoris/

    Favoris de l'utilisateur courant. Non paginé (volume par utilisateur
    toujours faible — même choix que geo/api_views.py pour les référentiels).
    """

    serializer_class = FavoriSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return Favori.objects.filter(user=self.request.user).select_related('annonce')


class FavoriToggleAPIView(APIView):
    """
    POST /api/favoris/toggle/  {"annonce": "<uuid>"}

    Ajoute l'annonce aux favoris si elle n'y est pas, la retire sinon.
    Réponse : {"is_favori": bool, "annonce": "<uuid>"}
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        annonce_id = request.data.get('annonce')
        if not annonce_id:
            return Response(
                {'annonce': ['Ce champ est obligatoire.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            annonce = Annonce.objects.get(pk=annonce_id)
        except (Annonce.DoesNotExist, ValidationError, ValueError):
            return Response({'detail': 'Annonce introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        favori = Favori.objects.filter(user=request.user, annonce=annonce).first()
        if favori:
            favori.delete()
            return Response({'is_favori': False, 'annonce': str(annonce.id)})

        Favori.objects.create(user=request.user, annonce=annonce)
        return Response({'is_favori': True, 'annonce': str(annonce.id)}, status=status.HTTP_201_CREATED)
