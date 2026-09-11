"""
URL configuration for akal project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
"""
from django.contrib import admin
from django.db import connection
from django.http import JsonResponse
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from akal.pilotage import tableau_de_bord


def healthz(_request):
    """Sonde de santé pour le load balancer (Render ``healthCheckPath``).

    200 si la base répond, 503 sinon — Render met alors l'instance hors
    rotation au lieu d'y router du trafic. Volontairement minimal : une
    requête SQL triviale, aucune dépendance à Redis/S3 (fail-open, cf.
    settings) ni à l'authentification.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1;")
            cursor.fetchone()
    except Exception:  # noqa: BLE001 — toute erreur DB = instance non saine
        return JsonResponse({'status': 'error', 'database': 'unreachable'}, status=503)
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('healthz/', healthz, name='healthz'),

    # AVANT admin/ : path('admin/', admin.site.urls) est un include qui
    # engloberait toute URL commençant par "admin/", pilotage/ compris, si
    # cette route venait après (même raison que l'ordre documenté dans
    # annonces/api_urls.py pour <uuid:pk>/ vs <slug:slug>/).
    path('admin/pilotage/', tableau_de_bord, name='pilotage'),
    path('admin/', admin.site.urls),

    # ── API REST v1 ──
    path('api/annonces/', include('annonces.api_urls')),
    path('api/parcelles/', include('agriscore.api_urls')),
    path('api/geo/', include('geo.urls')),
    path('api/auth/', include('accounts.urls')),
    path('api/conversations/', include('messaging.api_urls')),
    path('api/favoris/', include('messaging.urls')),
    path('api/notifications/', include('messaging.notifications_urls')),

    # ── OpenAPI / Swagger (drf-spectacular) ──
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/schema/swagger-ui/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
]
