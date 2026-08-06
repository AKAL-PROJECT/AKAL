"""
Routes API REST (DRF) de l'app geo.

    /api/geo/regions/    → Référentiel des régions (legacy, non géométrique)
    /api/geo/provinces/  → Provinces (filtrable par ?region=<code>)
    /api/geo/communes/   → Communes (filtrable par ?province=<code>)

    /api/geo/limites/regions/    → Référentiel géométrique officiel (2026-08-06) —
    /api/geo/limites/provinces/     cf. docs/plans/2026-08-06-communes-geo-design.md
    /api/geo/limites/communes/
"""

from django.urls import path

from .api_views import (
    CommuneGeomListAPIView,
    CommuneListAPIView,
    ProvinceGeomListAPIView,
    ProvinceListAPIView,
    RegionListAPIView,
    RegionOfficielleListAPIView,
)

app_name = 'geo-api'

urlpatterns = [
    path('regions/', RegionListAPIView.as_view(), name='regions'),
    path('provinces/', ProvinceListAPIView.as_view(), name='provinces'),
    path('communes/', CommuneListAPIView.as_view(), name='communes'),
    path('limites/regions/', RegionOfficielleListAPIView.as_view(), name='limites-regions'),
    path('limites/provinces/', ProvinceGeomListAPIView.as_view(), name='limites-provinces'),
    path('limites/communes/', CommuneGeomListAPIView.as_view(), name='limites-communes'),
]
