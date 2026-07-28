"""
Vues API REST (DRF) de l'app annonces.

Endpoints conformes au contrat frontend/backend (§4, contrat v1.2) :
    - GET  /api/annonces/         → Liste paginée avec filtres
    - POST /api/annonces/         → Création (dépôt F03) — statut forcé BROUILLON
    - GET  /api/annonces/<slug>/  → Détail complet d'une annonce (public, en_ligne)
    - GET/PATCH /api/annonces/<uuid:pk>/ → Lecture/édition du brouillon par son
      propriétaire (F03) — jamais scopé à en_ligne(), contrairement au détail
      public ci-dessus. La transition brouillon → en_ligne passe par un PATCH
      {"statut": "en_ligne"} sur cet endpoint (validée par Annonce.can_publish(),
      cf. serializers.py) — pas d'endpoint /publish/ dédié, pour rester
      conforme à la charte de nommage §4.1 ("jamais de verbe dans l'URL").
"""

from django.db import transaction
from django_filters import rest_framework as dj_filters
from rest_framework import generics, permissions, serializers, status
from rest_framework.fields import ImageField as DRFImageField
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Annonce, Parcelle, Photo
from .serializers import AnnonceListSerializer, AnnonceDetailSerializer, AnnonceEcritureSerializer


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

class AnnonceListCreateAPIView(generics.ListCreateAPIView):
    """
    GET  /api/annonces/  → Liste paginée des annonces en ligne avec filtres et tri.
    POST /api/annonces/  → Dépôt d'une nouvelle annonce (F03), authentifié.

    GET — Pagination : PageNumberPagination (page_size=12, max=50)
    Réponse : { count, next, previous, results: [...] }

    Filtres query params :
        q, region, statut_foncier, acces_eau,
        prix_min, prix_max, surface_min, surface_max

    Ordering (tri) — paramètre ?ordering= :
        date_publication, prix_mad, surface_ha
        (préfixer par - pour décroissant)

    POST — statut toujours forcé BROUILLON côté serveur (jamais choisi par le
    client, cf. AnnonceEcritureSerializer). Attribue le rôle VENDEUR à
    l'utilisateur s'il ne l'a pas déjà — décision du 2026-07-28 : déposer une
    annonce définit l'utilisateur comme vendeur, pas l'inverse.
    """

    pagination_class = AnnoncePagination
    filterset_class = AnnonceAPIFilter
    filter_backends = [
        dj_filters.DjangoFilterBackend,
    ]
    ordering = ['-date_publication']  # Tri par défaut (liste)

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return AnnonceEcritureSerializer
        return AnnonceListSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        if self.request.method == 'POST':
            return Annonce.objects.none()  # non utilisé en écriture, requis par le mixin
        return (
            Annonce.objects
            .en_ligne()
            .with_relations()
            .prefetch_related('parcelle__scores')
        )

    def perform_create(self, serializer):
        annonce = serializer.save(proprietaire=self.request.user)
        if self.request.user.role != self.request.user.Role.VENDEUR:
            self.request.user.role = self.request.user.Role.VENDEUR
            self.request.user.save(update_fields=['role'])
        return annonce


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


# ──────────────────────────────────────────────
# Permission propriétaire (F03)
# ──────────────────────────────────────────────

class EstProprietaire(permissions.BasePermission):
    """
    Autorise uniquement le propriétaire de l'annonce à la lire/modifier.

    Utilisée par AnnonceUpdateAPIView, dont le queryset n'est jamais scopé à
    en_ligne() (contrairement à AnnonceDetailAPIView) : cette permission est
    donc la seule barrière empêchant un utilisateur d'accéder au brouillon
    d'un autre.
    """

    def has_object_permission(self, request, view, obj):
        return obj.proprietaire_id == request.user.id


# Validation serveur systématique même si le client compresse déjà les
# images (browser-image-compression) : on ne fait jamais confiance au
# client (contrat §4.7 — cf. mission F03).
MAX_PHOTO_OCTETS = 2 * 1024 * 1024  # 2 Mo
MAX_PHOTOS_PAR_ANNONCE = 10


class AnnonceUpdateAPIView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH /api/annonces/<uuid:pk>/

    Lecture/édition du brouillon par son propriétaire (F03) — jamais scopé à
    en_ligne(), contrairement à AnnonceDetailAPIView (accès public par
    slug). Enregistrée AVANT la route <slug:slug>/ dans api_urls.py : un
    UUID est syntaxiquement aussi un slug valide, Django résout dans l'ordre
    de déclaration.

    PATCH accepte deux natures de contenu, combinables dans une même requête
    multipart :
      - champs Annonce/Parcelle classiques (titre, prix_mad, parcelle.*,
        statut, ...) → délégués à AnnonceEcritureSerializer.update() ;
      - photos, sous la clé `photos[]` (multipart uniquement) → validées ici
        (taille ≤ 2 Mo, contenu image réel via PIL) puis créées dans la même
        transaction atomique que le reste du PATCH.

    Les photos sont créées AVANT l'appel à partial_update() : si la même
    requête PATCH publie l'annonce (statut=en_ligne) ET dépose la première
    photo, Annonce.can_publish() doit voir cette photo au moment de son
    contrôle — sinon la publication échouerait à tort sur une annonce qui,
    de fait, aura bien une photo une fois la requête terminée.
    """

    serializer_class = AnnonceEcritureSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    permission_classes = [IsAuthenticated, EstProprietaire]
    # PUT (remplacement complet) n'est pas dans le contrat F03 — seul PATCH
    # (édition partielle) est spécifié. On le retire explicitement plutôt
    # que de laisser RetrieveUpdateAPIView l'exposer par défaut.
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_queryset(self):
        return (
            Annonce.objects
            .filter(proprietaire=self.request.user)
            .select_related('parcelle')
            .prefetch_related('photos')
        )

    @staticmethod
    def _valider_photo(fichier):
        """Lève ValidationError si la photo dépasse 2 Mo ou n'est pas une image décodable."""
        if fichier.size > MAX_PHOTO_OCTETS:
            raise serializers.ValidationError({
                'photos': f"« {fichier.name} » dépasse la taille maximale de 2 Mo."
            })
        try:
            DRFImageField().run_validation(fichier)
        except serializers.ValidationError:
            raise serializers.ValidationError({
                'photos': f"« {fichier.name} » n'est pas une image valide."
            })

    def patch(self, request, *args, **kwargs):
        instance = self.get_object()
        fichiers = request.FILES.getlist('photos[]')

        if fichiers and instance.photos.count() + len(fichiers) > MAX_PHOTOS_PAR_ANNONCE:
            return Response(
                {'photos': f"Maximum {MAX_PHOTOS_PAR_ANNONCE} photos par annonce."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for fichier in fichiers:
            try:
                self._valider_photo(fichier)
            except serializers.ValidationError as exc:
                return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            if fichiers:
                # bulk_create() n'appelle pas Photo.save() par instance — sans
                # incidence tant que Photo reste un modèle passif (pas de
                # signal, pas de save() custom, vérifié au 2026-07-28). Si
                # Photo.save() gagne un jour une logique (miniature, EXIF,
                # dédup...), repasser ici à des .save() unitaires dans la
                # transaction pour ne pas la contourner silencieusement.
                prochain_ordre = instance.photos.count()
                Photo.objects.bulk_create([
                    Photo(annonce=instance, image=fichier, ordre=prochain_ordre + i)
                    for i, fichier in enumerate(fichiers)
                ])
            return self.partial_update(request, *args, **kwargs)
