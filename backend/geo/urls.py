"""
Routes API REST (DRF) de l'app geo.

    /api/geo/regions/    → Référentiel des régions
    /api/geo/provinces/  → Provinces (filtrable par ?region=<code>)
    /api/geo/communes/   → Communes (filtrable par ?province=<code>)
"""

from django.urls import path

from .api_views import CommuneListAPIView, ProvinceListAPIView, RegionListAPIView

app_name = 'geo-api'

urlpatterns = [
    path('regions/', RegionListAPIView.as_view(), name='regions'),
    path('provinces/', ProvinceListAPIView.as_view(), name='provinces'),
    path('communes/', CommuneListAPIView.as_view(), name='communes'),
]
