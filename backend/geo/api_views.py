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
    GET /api/geo/limites/communes/<id>/           → Feature GeoJSON, une commune (ajout du
    2026-08-07, remise en vente/édition d'annonce) — pas de lookup inverse
    commune → région/province côté front (EtapeLocalisation ne connaît que
    l'id de commune stocké sur la parcelle) ; cette route permet de
    reconstruire la cascade région/province/commune pour pré-remplir le
    formulaire de modification d'une annonce déjà géolocalisée. Même
    serializer que la liste (une Feature au lieu d'une FeatureCollection).
"""

import logging

from django.contrib.gis.db.models import MultiPolygonField
from django.core.cache import cache
from django.db.models import F, Func, Value
from rest_framework import generics, permissions
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import Commune, CommuneGeom, Province, ProvinceGeom, Region, RegionOfficielle
from .serializers import (
    CommuneGeomListeSerializer,
    CommuneGeomSerializer,
    CommuneSerializer,
    ProvinceGeomListeSerializer,
    ProvinceGeomSerializer,
    ProvinceSerializer,
    RegionOfficielleSerializer,
    RegionSerializer,
)

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# Cache Redis des limites administratives officielles (hardening 2026-08-31)
# ──────────────────────────────────────────────
#
# Les endpoints /api/geo/limites/{regions,provinces,communes}/ servent des
# géométries administratives (découpage HCP) qui ne changent qu'au rythme
# d'un redécoupage national — quasiment jamais. Chaque réponse déclenche
# pourtant un ST_SimplifyPreserveTopology par feature (cf. _geom_simplifiee),
# et chaque carte du site en demande jusqu'à 12 en parallèle au montage
# (useLimitesRegions, frontend). Redis est déjà dans l'infra (django-redis,
# cf. settings CACHES) — on met en cache la RÉPONSE sérialisée (GeoJSON).
#
# TTL 24 h : rechargé au plus une fois par jour et par clé ; aucun risque
# réaliste de servir une frontière obsolète.
#
# Redis est une OPTIMISATION, jamais une dépendance dure : toute erreur de
# cache (Redis éteint, timeout) retombe silencieusement sur PostGIS —
# _cache_get/_cache_set ci-dessous. Le contenu servi est identique dans les
# deux cas (même queryset, même serializer). Rien mis en cache qui dépende
# d'un utilisateur ou d'une permission : ces endpoints sont AllowAny et la
# réponse ne dépend que des query params (region / province), encodés dans
# la clé.
TTL_CACHE_LIMITES = 60 * 60 * 24


def _cache_get(cle):
    try:
        return cache.get(cle)
    except Exception:
        logger.warning("Cache geo indisponible en lecture (%s) — repli PostGIS", cle, exc_info=True)
        return None


def _cache_set(cle, valeur):
    try:
        cache.set(cle, valeur, TTL_CACHE_LIMITES)
    except Exception:
        logger.warning("Cache geo indisponible en écriture (%s)", cle, exc_info=True)


class _CacheLimitesMixin:
    """
    Met en cache la réponse GeoJSON d'un ListAPIView de limites administratives.

    Les sous-classes implémentent `cle_cache(request)` :
        - str  → clé Redis stable, réponse mise en cache (TTL_CACHE_LIMITES) ;
        - None → jamais de cache (paramètre obligatoire manquant : on laisse
                 la vue répondre son 400 habituel).

    Les 3 familles de clés sont distinctes par construction :
        geo:limites:regions
        geo:limites:provinces:<region_slug>
        geo:limites:communes:p=<province_id>:r=<region_slug>
    """

    def cle_cache(self, request):  # pragma: no cover - override obligatoire
        raise NotImplementedError

    def list(self, request, *args, **kwargs):
        cle = self.cle_cache(request)
        if cle is None:
            return super().list(request, *args, **kwargs)
        en_cache = _cache_get(cle)
        if en_cache is not None:
            return Response(en_cache)
        reponse = super().list(request, *args, **kwargs)
        if reponse.status_code == 200:
            _cache_set(cle, reponse.data)
        return reponse


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

class RegionOfficielleListAPIView(_CacheLimitesMixin, generics.ListAPIView):
    """
    GET /api/geo/limites/regions/

    Les 12 régions officielles (codes HCP). Non géométrique (pas de source
    de polygone par région — les cartes s'appuient sur les provinces/
    communes), non paginé. Réponse mise en cache Redis (clé
    `geo:limites:regions`, cf. _CacheLimitesMixin).
    """

    serializer_class = RegionOfficielleSerializer
    queryset = RegionOfficielle.objects.all().order_by('code')
    pagination_class = None
    permission_classes = [permissions.AllowAny]

    def cle_cache(self, request):
        return "geo:limites:regions"


# Tolérance de simplification (degrés, WGS84) des contours régionaux/
# communaux servis en fond de carte décoratif — cf. commentaire au-dessus
# de ProvinceGeomListeSerializer/CommuneGeomListeSerializer (geo/serializers.py)
# pour le contexte complet. ~0.001° ≈ 100m à la latitude du Maroc :
# invisible à l'échelle où ces tracés sont affichés (jamais un zoom
# cadastral), mais réduit fortement le nombre de sommets envoyés (jusqu'à
# ~500 Ko par région avant simplification, audit cartographie du 19/08).
#
# ST_SimplifyPreserveTopology (pas ST_Simplify) : ne casse pas la
# géométrie d'UNE province/commune sur elle-même (auto-intersections). Ne
# garantit en revanche pas un bord parfaitement identique entre deux
# provinces/communes VOISINES, chacune simplifiée indépendamment (limite
# connue de cette fonction, pas une erreur d'implémentation) — un écart de
# quelques dizaines de mètres au pire, à cette tolérance, invisible aux
# zooms où ces cartes sont utilisées (vue Maroc entier ou région entière).
# ST_Multi(...) en plus : ST_SimplifyPreserveTopology peut renvoyer un
# POLYGON simple si la simplification supprime toutes les parties sauf
# une — ST_Multi() force un MULTIPOLYGON en sortie, cohérent avec le
# MultiPolygonField du modèle (geo/models.py), quel que soit le résultat.
TOLERANCE_SIMPLIFICATION_CARTE = 0.001


def _geom_simplifiee():
    return Func(
        Func(
            F('geom'),
            Value(TOLERANCE_SIMPLIFICATION_CARTE),
            function='ST_SimplifyPreserveTopology',
        ),
        function='ST_Multi',
        output_field=MultiPolygonField(srid=4326),
    )


class ProvinceGeomListAPIView(_CacheLimitesMixin, generics.ListAPIView):
    """
    GET /api/geo/limites/provinces/?region=<slug>

    GeoJSON FeatureCollection des provinces d'une région. `region`
    obligatoire (400 sinon) — ~123 000 sommets au total sur les 75
    provinces avant simplification, jamais de dump national non borné.
    Réponse mise en cache Redis par région (clé
    `geo:limites:provinces:<slug>`) ; `region` absent → pas de cache, 400.
    """

    serializer_class = ProvinceGeomListeSerializer
    pagination_class = None
    permission_classes = [permissions.AllowAny]

    def cle_cache(self, request):
        slug = request.query_params.get('region')
        return f"geo:limites:provinces:{slug}" if slug else None

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ProvinceGeom.objects.none()
        region_slug = self.request.query_params.get('region')
        if not region_slug:
            raise ValidationError({'region': "Ce paramètre est obligatoire."})
        return (
            ProvinceGeom.objects.filter(region__slug=region_slug)
            .select_related('region')
            .annotate(geom_simplifie=_geom_simplifiee())
            .order_by('nom')
        )


class CommuneGeomListAPIView(_CacheLimitesMixin, generics.ListAPIView):
    """
    GET /api/geo/limites/communes/?province=<id>
    GET /api/geo/limites/communes/?region=<slug>

    GeoJSON FeatureCollection des communes. Au moins un des deux filtres est
    obligatoire (400 sinon) — 1536 communes, ~260 000 sommets au total,
    jamais de dump non borné. Réponse mise en cache Redis par périmètre
    (clé `geo:limites:communes:p=<province>:r=<region>`) ; aucun filtre →
    pas de cache, 400.
    """

    serializer_class = CommuneGeomListeSerializer
    pagination_class = None
    permission_classes = [permissions.AllowAny]

    def cle_cache(self, request):
        province = request.query_params.get('province')
        region = request.query_params.get('region')
        if not province and not region:
            return None
        return f"geo:limites:communes:p={province or ''}:r={region or ''}"

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return CommuneGeom.objects.none()
        province_id = self.request.query_params.get('province')
        region_slug = self.request.query_params.get('region')
        if not province_id and not region_slug:
            raise ValidationError({'detail': "Le paramètre `province` ou `region` est obligatoire."})

        qs = CommuneGeom.objects.select_related('province', 'province__region').annotate(
            geom_simplifie=_geom_simplifiee()
        )
        if province_id:
            qs = qs.filter(province_id=province_id)
        if region_slug:
            qs = qs.filter(province__region__slug=region_slug)
        return qs.order_by('nom_affichage')


class CommuneGeomDetailAPIView(generics.RetrieveAPIView):
    """
    GET /api/geo/limites/communes/<id>/

    Une seule commune (Feature GeoJSON), avec province/région imbriquées —
    cf. docstring de module. Pas de filtre : lecture publique par id, comme
    le reste du référentiel officiel.
    """

    serializer_class = CommuneGeomSerializer
    permission_classes = [permissions.AllowAny]
    queryset = CommuneGeom.objects.select_related('province', 'province__region')
