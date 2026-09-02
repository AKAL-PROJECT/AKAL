"""
Vue API du pipeline AgriScore.

    GET /api/parcelles/<uuid:parcelle_id>/passeport/  → Passeport complet (JSON)

Publique (comme le catalogue), throttlée par scope ``passeport`` : un appel
non caché déclenche jusqu'à 5 requêtes vers des API externes. La mise en
cache par agent (agriscore/agents/_cache.py) rend les appels répétés — même
parcelle, parcelles voisines — quasi gratuits.
"""

import logging

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from agriscore.passeport import passeport_parcelle
from annonces.models import Parcelle

logger = logging.getLogger(__name__)


class PasseportParcelleAPIView(APIView):
    """GET /api/parcelles/<uuid:parcelle_id>/passeport/"""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_scope = 'passeport'
    throttle_classes = [ScopedRateThrottle]

    @extend_schema(
        operation_id='parcelle_passeport',
        parameters=[OpenApiParameter('parcelle_id', str, OpenApiParameter.PATH)],
        responses={200: dict, 404: dict, 422: dict},
        description="Passeport AgriScore complet d'une parcelle (score, fiabilité, "
                    "détail par dimension, cultures suggérées).",
    )
    def get(self, request, parcelle_id):
        parcelle = get_object_or_404(
            Parcelle.objects.only('id', 'latitude', 'longitude'), pk=parcelle_id
        )
        if parcelle.latitude is None or parcelle.longitude is None:
            return Response(
                {'detail': "Parcelle non géolocalisée : passeport indisponible."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        passeport = passeport_parcelle(parcelle.latitude, parcelle.longitude)
        passeport['parcelle_id'] = str(parcelle.id)
        return Response(passeport)
