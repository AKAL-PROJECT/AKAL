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
"""

from rest_framework import generics

from .models import Commune, Province, Region
from .serializers import CommuneSerializer, ProvinceSerializer, RegionSerializer


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
