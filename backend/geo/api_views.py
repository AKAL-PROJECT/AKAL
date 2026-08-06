"""
Vues API REST (DRF) de l'app geo.

    GET /api/geo/regions/                → Référentiel des régions (non paginé)
    GET /api/geo/provinces/?region=<code>   → Provinces d'une région (ou toutes si omis)
    GET /api/geo/communes/?province=<code>  → Communes d'une province (ou toutes si omis)

Ajout du 2026-07-28 (provinces/communes) : ce référentiel géographique
appartient normalement au périmètre d'Ibrahim (cf. décision F03 Étape 0 —
la cascade région/province/commune n'est pas dans le périmètre initial du
module dépôt d'annonce). Ces deux endpoints sont ajoutés ici par nécessité
de test — sans eux, l'étape "Localisation" du formulaire de dépôt ne peut
proposer aucune commune réelle, et Annonce.can_publish() ne peut jamais
passer (il exige parcelle.commune renseigné). Décision explicite, pas une
absorption silencieuse de scope : à signaler à Ibrahim pour relecture/
alignement avec le reste du référentiel geo.

Référentiel géométrique officiel (2026-08-06, cf. docs/plans) — préfixe
/api/geo/limites/, lecture seule, GeoJSON pour provinces/communes :

    GET /api/geo/limites/regions/                → 12 régions officielles, JSON simple
    GET /api/geo/limites/provinces/?region=<slug> → GeoJSON FeatureCollection, `region` obligatoire
    GET /api/geo/limites/communes/?province=<id>  → GeoJSON FeatureCollection
    GET /api/geo/limites/communes/?region=<slug>  → idem, `province` ou `region` obligatoire
"""

from rest_framework import generics, permissions
from rest_framework.exceptions import ValidationError

from .models import Commune, CommuneGeom, Province, ProvinceGeom, Region, RegionOfficielle
from .serializers import (
    CommuneGeomSerializer,
    CommuneSerializer,
    ProvinceGeomSerializer,
    ProvinceSerializer,
    RegionOfficielleSerializer,
    RegionSerializer,
)


class RegionListAPIView(generics.ListAPIView):
    """
    GET /api/geo/regions/

    Retourne la liste complète des régions du Maroc.
    Non paginé (référentiel statique).
    """

    serializer_class = RegionSerializer
    queryset = Region.objects.all().order_by('id')
    pagination_class = None  # Pas de pagination pour un référentiel


class ProvinceListAPIView(generics.ListAPIView):
    """
    GET /api/geo/provinces/?region=<code>

    Provinces de la région donnée (code slug, ex. casablanca-settat),
    ou référentiel complet si `region` est omis. Non paginé.
    """

    serializer_class = ProvinceSerializer
    pagination_class = None

    def get_queryset(self):
        qs = Province.objects.all().order_by('id')
        region_code = self.request.query_params.get('region')
        if region_code:
            qs = qs.filter(region__code=region_code)
        return qs


class CommuneListAPIView(generics.ListAPIView):
    """
    GET /api/geo/communes/?province=<code>

    Communes de la province donnée (code slug), ou référentiel complet si
    `province` est omis. Non paginé.
    """

    serializer_class = CommuneSerializer
    pagination_class = None

    def get_queryset(self):
        qs = Commune.objects.all().order_by('id')
        province_code = self.request.query_params.get('province')
        if province_code:
            qs = qs.filter(province__code=province_code)
        return qs


# ──────────────────────────────────────────────
# Référentiel géométrique officiel (2026-08-06)
# ──────────────────────────────────────────────

class RegionOfficielleListAPIView(generics.ListAPIView):
    """
    GET /api/geo/limites/regions/

    Les 12 régions officielles (codes HCP). Non géométrique (pas de source
    de polygone par région — les cartes s'appuient sur les provinces/
    communes), non paginé.
    """

    serializer_class = RegionOfficielleSerializer
    queryset = RegionOfficielle.objects.all().order_by('code')
    pagination_class = None
    permission_classes = [permissions.AllowAny]


class ProvinceGeomListAPIView(generics.ListAPIView):
    """
    GET /api/geo/limites/provinces/?region=<slug>

    GeoJSON FeatureCollection des provinces d'une région. `region`
    obligatoire (400 sinon) — ~123 000 sommets au total sur les 75
    provinces, jamais de dump national non borné.
    """

    serializer_class = ProvinceGeomSerializer
    pagination_class = None
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ProvinceGeom.objects.none()
        region_slug = self.request.query_params.get('region')
        if not region_slug:
            raise ValidationError({'region': "Ce paramètre est obligatoire."})
        return (
            ProvinceGeom.objects.filter(region__slug=region_slug)
            .select_related('region')
            .order_by('nom')
        )


class CommuneGeomListAPIView(generics.ListAPIView):
    """
    GET /api/geo/limites/communes/?province=<id>
    GET /api/geo/limites/communes/?region=<slug>

    GeoJSON FeatureCollection des communes. Au moins un des deux filtres est
    obligatoire (400 sinon) — 1536 communes, ~260 000 sommets au total,
    jamais de dump non borné.
    """

    serializer_class = CommuneGeomSerializer
    pagination_class = None
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return CommuneGeom.objects.none()
        province_id = self.request.query_params.get('province')
        region_slug = self.request.query_params.get('region')
        if not province_id and not region_slug:
            raise ValidationError({'detail': "Le paramètre `province` ou `region` est obligatoire."})

        qs = CommuneGeom.objects.select_related('province', 'province__region')
        if province_id:
            qs = qs.filter(province_id=province_id)
        if region_slug:
            qs = qs.filter(province__region__slug=region_slug)
        return qs.order_by('nom_affichage')
