"""
Serializers DRF pour l'app geo.

    RegionSerializer   → Référentiel des régions [{id, code, nom}]
    ProvinceSerializer → Référentiel des provinces [{id, code, nom}]
    CommuneSerializer  → Référentiel des communes [{id, nom}] (pas de `code` —
                         Commune n'a pas ce champ, cf. models.py)

Référentiel géométrique officiel (2026-08-06, cf. docs/plans) :
    RegionOfficielleSerializer → [{code, slug, nom}], 12 régions
    ProvinceGeomSerializer     → GeoJSON Feature, une province
    CommuneGeomSerializer      → GeoJSON Feature, une commune
"""

from rest_framework import serializers
from rest_framework_gis.fields import GeometryField
from rest_framework_gis.serializers import GeoFeatureModelSerializer

from .models import Commune, CommuneGeom, Province, ProvinceGeom, Region, RegionOfficielle


class RegionSerializer(serializers.ModelSerializer):
    """Serializer pour le référentiel des régions du Maroc."""

    class Meta:
        model = Region
        fields = ['id', 'code', 'nom']


class ProvinceSerializer(serializers.ModelSerializer):
    """Serializer pour le référentiel des provinces d'une région."""

    class Meta:
        model = Province
        fields = ['id', 'code', 'nom']


class CommuneSerializer(serializers.ModelSerializer):
    """Serializer pour le référentiel des communes d'une province."""

    class Meta:
        model = Commune
        fields = ['id', 'nom']


# ──────────────────────────────────────────────
# Référentiel géométrique officiel
# ──────────────────────────────────────────────

class RegionOfficielleSerializer(serializers.ModelSerializer):
    """{code, slug, nom} — les 12 régions officielles (codes HCP)."""

    class Meta:
        model = RegionOfficielle
        fields = ['code', 'slug', 'nom']


class ProvinceResumeSerializer(serializers.ModelSerializer):
    """Résumé allégé {id, nom} — pour imbrication dans CommuneGeomSerializer
    (jamais la géométrie de la province ici, déjà récupérable séparément)."""

    class Meta:
        model = ProvinceGeom
        fields = ['id', 'nom']


class ProvinceGeomSerializer(GeoFeatureModelSerializer):
    """Feature GeoJSON — une province, avec sa région imbriquée."""

    region = RegionOfficielleSerializer(read_only=True)

    class Meta:
        model = ProvinceGeom
        geo_field = 'geom'
        fields = ['id', 'iso', 'nom', 'nom_ar', 'region']


class CommuneGeomSerializer(GeoFeatureModelSerializer):
    """
    Feature GeoJSON — une commune, avec province (allégée) et région
    imbriquées. `region` est un SerializerMethodField (dérivé de
    `province.region`) — pas de champ dupliqué sur CommuneGeom, cf.
    docs/plans/2026-08-06-communes-geo-design.md.
    """

    province = ProvinceResumeSerializer(read_only=True)
    region = serializers.SerializerMethodField()

    class Meta:
        model = CommuneGeom
        geo_field = 'geom'
        fields = ['id', 'nom_affichage', 'type_commune', 'province', 'region']

    def get_region(self, obj):
        return RegionOfficielleSerializer(obj.province.region).data


# ──────────────────────────────────────────────
# Variantes "liste" (fond de carte décoratif) — audit cartographie du 19/08
# ──────────────────────────────────────────────
#
# ProvinceGeomListAPIView/CommuneGeomListAPIView servent des contours
# affichés sous les pins d'annonces (catalogue, carte plein écran,
# couverture Home) — jamais un zoom cadastral, jamais de calcul spatial
# côté client. Leur géométrie source pèse pourtant jusqu'à ~500 Ko par
# région (mesuré le 19/08 sur /api/geo/limites/provinces/) : une précision
# au mètre près qui n'apporte rien à cette échelle d'affichage.
#
# `geom_simplifie` n'est PAS un champ du modèle — une annotation
# ST_SimplifyPreserveTopology posée par la queryset de chaque vue (cf.
# api_views.py), déclarée ici en `GeometryField` explicite (obligatoire :
# GeoFeatureModelSerializer construit sinon `geo_field` en introspectant
# les champs RÉELS du modèle, où cette annotation n'existe pas — lève
# `ImproperlyConfigured`). `precision=5` (~1m) réduit en plus la taille de
# chaque coordonnée individuelle (Django/PostGIS ne tronquent pas les
# décimales par défaut) — cumulatif avec la réduction du nombre de sommets.
#
# Classes indépendantes plutôt que des sous-classes de
# ProvinceGeomSerializer/CommuneGeomSerializer ci-dessus :
# ProvinceGeomSerializer.Meta.fields est muté EN PLACE par
# GeoFeatureModelSerializer.__init__ (qui y ajoute 'geom') dès la première
# instanciation — en hériter aurait fait réapparaître 'geom' (pleine
# précision) comme simple propriété JSON en plus de 'geom_simplifie' comme
# géométrie, doublant le poids au lieu de le réduire. Un peu de duplication
# déclarative, mais aucun piège d'héritage partagé.
class ProvinceGeomListeSerializer(GeoFeatureModelSerializer):
    """Feature GeoJSON simplifiée — une province, pour ProvinceGeomListAPIView."""

    region = RegionOfficielleSerializer(read_only=True)
    geom_simplifie = GeometryField(precision=5)

    class Meta:
        model = ProvinceGeom
        geo_field = 'geom_simplifie'
        fields = ['id', 'iso', 'nom', 'nom_ar', 'region']


class CommuneGeomListeSerializer(GeoFeatureModelSerializer):
    """Feature GeoJSON simplifiée — une commune, pour CommuneGeomListAPIView.
    CommuneGeomDetailAPIView (une seule commune, pré-remplissage d'un
    formulaire d'édition d'annonce) garde CommuneGeomSerializer en pleine
    précision — pas le même usage, et un seul polygone ne pèse de toute
    façon jamais lourd."""

    province = ProvinceResumeSerializer(read_only=True)
    region = serializers.SerializerMethodField()
    geom_simplifie = GeometryField(precision=5)

    class Meta:
        model = CommuneGeom
        geo_field = 'geom_simplifie'
        fields = ['id', 'nom_affichage', 'type_commune', 'province', 'region']

    def get_region(self, obj):
        return RegionOfficielleSerializer(obj.province.region).data
