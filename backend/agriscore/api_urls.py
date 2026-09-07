"""
Routes API de l'app agriscore.

    GET /api/parcelles/<uuid:parcelle_id>/passeport/  → Passeport AgriScore complet
"""

from django.urls import path

from .api_views import PasseportParcelleAPIView

app_name = 'agriscore-api'

urlpatterns = [
    path('<uuid:parcelle_id>/passeport/', PasseportParcelleAPIView.as_view(), name='passeport'),
]
