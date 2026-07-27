"""
Vues API REST (DRF) de l'app annonces.

Endpoints conformes au contrat frontend/backend (§4, contrat v1.2) :
    - GET /api/annonces/        → Liste paginée avec filtres
    - GET /api/annonces/<slug>/ → Détail complet d'une annonce
"""

from django_filters import rest_framework as dj_filters
from rest_framework import generics

from .models import Annonce, Parcelle
from .serializers import AnnonceListSerializer, AnnonceDetailSerializer


# ──────────────────────────────────────────────
# FilterSet DRF pour l'endpoint liste
# ──────────────────────────────────────────────

class AnnonceAPIFilter(dj_filters.FilterSet):
    """
    FilterSet pour l'API REST /api/annonces/.

    Paramètres query string :
        ?q=                → Recherche texte sur le titre et la description
        ?region=           → Code slug de la région (ex: casablanca-settat)
        ?statut_foncier=   → Statut foncier exact
        ?acces_eau=        → Accès eau exact
        ?prix_min=         → Prix minimum (>=)
        ?prix_max=         → Prix maximum (<=)
        ?surface_min=      → Surface minimum en ha (>=)
        ?surface_max=      → Surface maximum en ha (<=)
        ?ordering=         → Tri : date_publication, prix_mad, surface_ha (préfixe - pour desc)
    """

    q = dj_filters.CharFilter(
        method='filter_search',
        label='Recherche',
    )
    region = dj_filters.CharFilter(
        field_name='parcelle__commune__province__region__code',
        lookup_expr='exact',
        label='Région (code slug)',
    )
    statut_foncier = dj_filters.ChoiceFilter(
        field_name='parcelle__statut_foncier',
        choices=Parcelle.StatutFoncier.choices,
        label='Statut foncier',
    )
    acces_eau = dj_filters.ChoiceFilter(
        field_name='parcelle__acces_eau',
        choices=Parcelle.AccesEau.choices,
        label='Accès eau',
    )
    prix_min = dj_filters.NumberFilter(
        field_name='prix_mad',
        lookup_expr='gte',
        label='Prix minimum (MAD)',
    )
    prix_max = dj_filters.NumberFilter(
        field_name='prix_mad',
        lookup_expr='lte',
        label='Prix maximum (MAD)',
    )
    surface_min = dj_filters.NumberFilter(
        field_name='parcelle__surface_ha',
        lookup_expr='gte',
        label='Surface minimum (ha)',
    )
    surface_max = dj_filters.NumberFilter(
        field_name='parcelle__surface_ha',
        lookup_expr='lte',
        label='Surface maximum (ha)',
    )

    # ── T4 : Ordering conforme au contrat §4.2 ──
    ordering = dj_filters.OrderingFilter(
        fields=(
            ('date_publication', 'date_publication'),
            ('prix_mad', 'prix_mad'),
            ('parcelle__surface_ha', 'surface_ha'),
        ),
    )

    class Meta:
        model = Annonce
        fields = []

    def filter_search(self, queryset, name, value):
        """Recherche texte insensible à la casse sur titre + description."""
        return queryset.search(value)


# ──────────────────────────────────────────────
# Pagination custom
# ──────────────────────────────────────────────

from rest_framework.pagination import PageNumberPagination


class AnnoncePagination(PageNumberPagination):
    """Pagination conforme au contrat : page_size=12, max=50."""
    page_size = 12
    page_size_query_param = 'page_size'
    max_page_size = 50


# ──────────────────────────────────────────────
# Vues API
# ──────────────────────────────────────────────

class AnnonceListAPIView(generics.ListAPIView):
    """
    GET /api/annonces/

    Liste paginée des annonces en ligne avec filtres et tri.

    Pagination : PageNumberPagination (page_size=12, max=50)
    Réponse : { count, next, previous, results: [...] }

    Filtres query params :
        q, region, statut_foncier, acces_eau,
        prix_min, prix_max, surface_min, surface_max

    Ordering (tri) — paramètre ?ordering= :
        date_publication, prix_mad, surface_ha
        (préfixer par - pour décroissant)
    """

    serializer_class = AnnonceListSerializer
    pagination_class = AnnoncePagination
    filterset_class = AnnonceAPIFilter
    filter_backends = [
        dj_filters.DjangoFilterBackend,
    ]
    ordering = ['-date_publication']  # Tri par défaut

    def get_queryset(self):
        """Annonces en ligne avec relations pré-chargées."""
        return (
            Annonce.objects
            .en_ligne()
            .with_relations()
            .prefetch_related('parcelle__scores')
        )


class AnnonceDetailAPIView(generics.RetrieveAPIView):
    """
    GET /api/annonces/<slug>/

    Détail complet d'une annonce (lookup par slug).
    """

    serializer_class = AnnonceDetailSerializer
    lookup_field = 'slug'

    def get_queryset(self):
        """Annonces en ligne avec toutes les relations."""
        return (
            Annonce.objects
            .en_ligne()
            .with_relations()
            .prefetch_related('parcelle__scores')
        )
