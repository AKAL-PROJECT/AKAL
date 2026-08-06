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
