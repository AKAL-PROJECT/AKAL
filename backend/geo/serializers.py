"""
Serializers DRF pour l'app geo.

    RegionSerializer   → Référentiel des régions [{id, code, nom}]
    ProvinceSerializer → Référentiel des provinces [{id, code, nom}]
    CommuneSerializer  → Référentiel des communes [{id, nom}] (pas de `code` —
                         Commune n'a pas ce champ, cf. models.py)
"""

from rest_framework import serializers

from .models import Commune, Province, Region


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
