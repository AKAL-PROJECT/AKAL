# pyrefly: ignore [missing-import]
from rest_framework import serializers

from .models import Favori


class FavoriSerializer(serializers.ModelSerializer):
    class Meta:
        model = Favori
        fields = ['id', 'annonce', 'created_at']
        read_only_fields = ['id', 'created_at']
