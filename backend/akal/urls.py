"""
URL configuration for akal project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
"""
from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
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
