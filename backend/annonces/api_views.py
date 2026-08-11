"""
Vues API REST (DRF) de l'app annonces.

Endpoints conformes au contrat frontend/backend (§4, contrat v1.2) :
    - GET  /api/annonces/         → Liste paginée avec filtres
    - POST /api/annonces/         → Création (dépôt F03) — statut forcé BROUILLON
    - GET  /api/annonces/mes-annonces/ → Liste de toutes les annonces du
      propriétaire connecté, tous statuts confondus (dashboard propriétaire,
      hors contrat F03 initial — ajout du 2026-07-29)
    - GET  /api/annonces/mes-annonces/statistiques/ → Favoris reçus,
      conversations reçues, messages non lus du propriétaire connecté
      (dashboard propriétaire — ajout du 2026-08-03). Le décompte par statut
      d'annonce n'est PAS dupliqué ici : déjà dérivable côté front depuis
      GET /mes-annonces/ ci-dessus.
    - GET  /api/annonces/<slug>/  → Détail complet d'une annonce (public, en_ligne)
    - GET/PATCH /api/annonces/<uuid:pk>/ → Lecture/édition par son propriétaire
      (F03) — jamais scopé à en_ligne(), contrairement au détail public
      ci-dessus : ceci reste vrai quel que soit le statut de l'annonce.
      Règle officialisée le 2026-07-29 (dashboard propriétaire, P1 #4) :
        - édition de CONTENU (titre, description, prix, parcelle, photos) →
          autorisée sur une annonce à n'importe quel statut, via ce PATCH ;
        - changement de STATUT → gouverné exclusivement par le graphe de
          transitions de annonces/transitions.py (P2 — 2026-07-30), consulté
          par AnnonceEcritureSerializer.validate_statut(). Toute nouvelle
          transition future s'ajoute dans ce module, jamais en contournant ce
          PATCH par un endpoint /publish/ ou /archive/ dédié — conforme à la
          charte de nommage §4.1 ("jamais de verbe dans l'URL").
    - DELETE /api/annonces/<uuid:annonce_id>/photos/<uuid:photo_id>/ →
      Suppression d'une photo de brouillon par son propriétaire. Ajout du
      2026-07-28, hors contrat initial (4 endpoints validés à l'Étape 0/1) :
      demandé explicitement lors de la recette utilisateur ("suppression/
      remplacement de photo"), restreint aux annonces BROUILLON — l'édition
      d'annonces déjà en_ligne reste hors périmètre F03.
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import F, Q, Sum
from django_filters import rest_framework as dj_filters
from rest_framework import generics, permissions, serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.fields import ImageField as DRFImageField
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle, UserRateThrottle
from rest_framework.views import APIView

# Import cross-app annonces -> messaging (sens inverse de l'existant
# messaging -> annonces) : aucun cycle, les FK de messaging.models vers
# annonces.Annonce sont déjà en référence string ('annonces.Annonce').
from messaging.models import Conversation, Favori, Message

from .models import Annonce, Parcelle, Photo, StatistiqueAnnonce
from .serializers import (
    AnnonceListSerializer,
    AnnonceDetailSerializer,
    AnnonceEcritureSerializer,
    MesStatistiquesSerializer,
)


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
        method='filter_region',
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

    def filter_region(self, queryset, name, value):
        """
        Filtre par slug de région, sur l'une ou l'autre chaîne géo
        (référentiel legacy `commune` ou officiel `commune_geom`,
        2026-08-06) — une annonce n'a jamais les deux à la fois, mais le
        catalogue mélange des annonces publiées avant et après l'introduction
        du référentiel officiel. Sans ce OR, le filtre région casserait pour
        toute nouvelle annonce utilisant commune_geom.
        """
        return queryset.filter(
            Q(parcelle__commune__province__region__code=value)
            | Q(parcelle__commune_geom__province__region__slug=value)
        )


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

# Quota d'annonces actives par propriétaire (audit go-live du 2026-08-10,
# complément du throttling 'annonce_create' ci-dessous — deux protections
# indépendantes : le throttle borne le débit de création, le quota borne le
# stock accumulé). Compte brouillon + en_attente + en_ligne uniquement,
# jamais archivee/vendue (décision produit du 2026-08-10) : une annonce
# vendue ou archivée n'est plus un risque d'abus actif, un vendeur qui a
# conclu des ventes ne doit pas être bloqué pour en déposer de nouvelles.
MAX_ANNONCES_ACTIVES = 20
STATUTS_ANNONCES_ACTIVES = (
    Annonce.StatutAnnonce.BROUILLON,
    Annonce.StatutAnnonce.EN_ATTENTE,
    Annonce.StatutAnnonce.EN_LIGNE,
)


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
    # Lu uniquement par ScopedRateThrottle sur POST (cf. get_throttles) — sans
    # effet sur GET, qui reste sur le plancher global anon/user par défaut.
    throttle_scope = 'annonce_create'

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return AnnonceEcritureSerializer
        return AnnonceListSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated()]
        return [permissions.AllowAny()]

    def get_throttles(self):
        # Audit go-live du 2026-08-10 : un dépôt d'annonce illimité permet de
        # spammer le catalogue (brouillons jamais publiés, mais visibles du
        # propriétaire, stockés indéfiniment) — scope dédié en plus du
        # plancher générique 'user'. GET reste public, jamais concerné.
        if self.request.method == 'POST':
            return [UserRateThrottle(), ScopedRateThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        if self.request.method == 'POST':
            return Annonce.objects.none()  # non utilisé en écriture, requis par le mixin
        return (
            Annonce.objects
            .en_ligne()
            .dataset_actif()
            .with_relations()
            .prefetch_related('parcelle__scores')
        )

    def perform_create(self, serializer):
        # Quota vérifié AVANT toute écriture (cf. MAX_ANNONCES_ACTIVES
        # ci-dessus) — jamais de création partielle suivie d'un rejet.
        annonces_actives = Annonce.objects.filter(
            proprietaire=self.request.user, statut__in=STATUTS_ANNONCES_ACTIVES,
        ).count()
        if annonces_actives >= MAX_ANNONCES_ACTIVES:
            raise serializers.ValidationError({
                'detail': (
                    f"Vous avez atteint la limite de {MAX_ANNONCES_ACTIVES} annonces actives ou en "
                    "brouillon. Archivez, publiez ou supprimez une annonce existante avant d'en "
                    "déposer une nouvelle."
                ),
            })

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
            .dataset_actif()
            .with_relations()
            .prefetch_related('parcelle__scores')
        )


class MesAnnoncesListAPIView(generics.ListAPIView):
    """
    GET /api/annonces/mes-annonces/

    Liste de TOUTES les annonces du propriétaire connecté, quel que soit leur
    statut (brouillon, en_attente, en_ligne, archivee, vendue) — contrairement
    à AnnonceListCreateAPIView (GET), qui ne retourne que les annonces
    en_ligne. Alimente le dashboard propriétaire (« Mes annonces »).

    Pas de pagination : le volume attendu par vendeur reste faible pour le MVP.
    """

    serializer_class = AnnonceListSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return (
            Annonce.objects
            .filter(proprietaire=self.request.user)
            .with_relations()
            .prefetch_related('parcelle__scores')
        )


class MesStatistiquesAPIView(APIView):
    """
    GET /api/annonces/mes-annonces/statistiques/

    Statistiques du dashboard propriétaire — favoris reçus, conversations
    reçues, messages non lus, vues totales. Volontairement PAS de décompte
    par statut d'annonce ici (brouillon/en_ligne/archivee/vendue) : cette
    donnée est déjà entièrement dérivable côté front depuis la réponse de
    GET /mes-annonces/ (liste déjà chargée par le dashboard, cf.
    compte/annonces/page.tsx::calculerKpis() côté front) — la dupliquer
    serait un aller-retour réseau pour rien (revérifié le 2026-08-10 avant
    l'ajout de vues_totales ci-dessous : toujours vrai, décision reconduite).

    5 requêtes simples, toutes indexées sur une FK (annonce/proprietaire,
    conversation) — pas de N+1, pas de préchargement nécessaire :
        - favoris_recus : Favori posés par d'autres sur les annonces de
          l'utilisateur (sens inverse de GET /api/favoris/).
        - conversations_recues : Conversation où l'utilisateur est le
          propriétaire de l'annonce (exclut celles qu'il a lui-même
          initiées en tant qu'acheteur — contrairement à
          messaging.api_views._conversations_de(), qui mélange les deux rôles).
        - messages_non_lus : Message non lus dans ces conversations, jamais
          les messages de l'utilisateur lui-même (même filtre que
          ConversationListSerializer.get_messages_non_lus(), en agrégat).
        - vues_totales : somme de StatistiqueAnnonce.vues sur toutes les
          annonces de l'utilisateur. Ajout du 2026-08-10 — donnée réellement
          nouvelle (pas dérivable de GET /mes-annonces/, contrairement au
          décompte par statut ci-dessus) : StatistiqueAnnonce existe déjà en
          base (modèle + admin) mais n'est encore incrémenté nulle part dans
          le code — vaut donc 0 pour tout le monde tant qu'un mécanisme de
          comptage de vues n'est pas construit ailleurs. Champ ajouté par
          anticipation (forward-compatible), pas parce qu'il affiche déjà
          une valeur utile aujourd'hui.
    """

    permission_classes = [IsAuthenticated]
    # Jamais instancié par le framework (get() ci-dessous construit et
    # remplit le serializer lui-même) — sert uniquement d'indice statique
    # pour drf-spectacular, qui ne sait pas deviner le corps de réponse
    # d'une APIView nue. Sans ça, l'endpoint apparaît dans Swagger sans
    # schéma de réponse documenté.
    serializer_class = MesStatistiquesSerializer

    def get(self, request):
        favoris_recus = Favori.objects.filter(
            annonce__proprietaire=request.user
        ).count()
        conversations_recues = Conversation.objects.filter(
            annonce__proprietaire=request.user
        ).count()
        messages_non_lus = Message.objects.filter(
            conversation__annonce__proprietaire=request.user,
            is_lu=False,
        ).exclude(auteur=request.user).count()
        vues_totales = StatistiqueAnnonce.objects.filter(
            annonce__proprietaire=request.user,
        ).aggregate(total=Sum('vues'))['total'] or 0

        serializer = MesStatistiquesSerializer({
            'favoris_recus': favoris_recus,
            'conversations_recues': conversations_recues,
            'messages_non_lus': messages_non_lus,
            'vues_totales': vues_totales,
        })
        return Response(serializer.data)


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


class PhotoUploadRateThrottle(ScopedRateThrottle):
    """
    Scope 'photo_upload' (audit go-live du 2026-08-10) — une photo coûte du
    stockage S3/MinIO réel (jusqu'à 2 Mo × 10 par annonce) même déposée par
    un compte authentifié et légitime : c'est le vecteur d'abus le plus
    cher de toute l'API, pas seulement un problème de volume de requêtes.
    D'où un scope dédié, plus strict que le plancher générique 'user'.

    Ne s'applique QU'aux requêtes qui déposent effectivement des photos —
    AnnonceUpdateAPIView.patch() sert aussi les éditions de contenu pur
    (titre, prix, statut...) sur ce même endpoint, qui ne doivent jamais
    être comptées ici ni consommer ce quota (cf. allow_request ci-dessous,
    retour anticipé avant tout accès au cache de throttling).

    Le scope réel est lu sur `view.throttle_scope` par ScopedRateThrottle
    (jamais sur un attribut `scope` posé ici) — cf. AnnonceUpdateAPIView
    ci-dessous, qui doit donc déclarer `throttle_scope = 'photo_upload'`.
    """

    def allow_request(self, request, view):
        if not request.FILES.getlist('photos[]'):
            return True
        return super().allow_request(request, view)


class AnnonceUpdateAPIView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH /api/annonces/<uuid:pk>/

    Lecture/édition par son propriétaire (F03) — jamais scopé à en_ligne(),
    contrairement à AnnonceDetailAPIView (accès public par slug) : le
    propriétaire retrouve/édite ses annonces quel que soit leur statut.
    Enregistrée AVANT la route <slug:slug>/ dans api_urls.py : un UUID est
    syntaxiquement aussi un slug valide, Django résout dans l'ordre de
    déclaration.

    Édition de CONTENU vs. changement de STATUT (officialisé 2026-07-29,
    dashboard propriétaire P1 #4) — deux choses distinctes gérées par ce même
    PATCH mais gouvernées par des règles différentes : le contenu (titre,
    description, prix, parcelle, photos) est éditable sans restriction de
    statut ; le champ `statut` lui-même reste seul soumis au graphe de
    annonces/transitions.py, consulté par
    AnnonceEcritureSerializer.validate_statut().

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
    # UserRateThrottle : plancher générique (toute édition, avec ou sans
    # photo). PhotoUploadRateThrottle : scope 'photo_upload' strict, mais
    # seulement si la requête contient réellement des photos (cf. sa propre
    # docstring) — GET ne déclenche jamais ni l'un ni l'autre de façon
    # gênante, IsAuthenticated exclut déjà l'anonyme. throttle_scope doit
    # être posé ICI (sur la vue) : ScopedRateThrottle.allow_request() lit
    # `view.throttle_scope`, jamais un attribut `scope` sur la classe de
    # throttle elle-même — piège vérifié en pratique (le throttle laissait
    # tout passer silencieusement sans cette ligne).
    throttle_classes = [UserRateThrottle, PhotoUploadRateThrottle]
    throttle_scope = 'photo_upload'

    def get_queryset(self):
        # PAS de select_related('parcelle__donnees_geo') : ParcelleEcritureSerializer
        # peut créer/remplacer ce DonneesGeo pendant l'update() de la même
        # requête (cf. _appliquer_contour) — un select_related le mettrait en
        # cache AVANT cette mutation, et to_representation() renverrait alors
        # l'ancien contour au lieu du nouveau. Requête supplémentaire
        # négligeable ici (vue mono-objet, pas une liste).
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
        except (serializers.ValidationError, DjangoValidationError):
            # ImageField.to_internal_value() délègue à Django (forms.ImageField.clean())
            # sans passer par le run_validators() de DRF : l'exception réelle levée
            # sur un fichier non-image est django.core.exceptions.ValidationError,
            # pas rest_framework.exceptions.ValidationError — les deux sont donc
            # capturées ici plutôt que de laisser passer un 500 non voulu.
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


class PhotoDeleteAPIView(generics.DestroyAPIView):
    """
    DELETE /api/annonces/<uuid:annonce_id>/photos/<uuid:photo_id>/

    Supprime une photo d'un brouillon appartenant à l'utilisateur connecté.
    Restreint aux annonces BROUILLON — supprimer une photo d'une annonce déjà
    en_ligne est hors périmètre F03 (édition de listing publié).

    Réordonne les photos restantes pour que `ordre` reste contigu à partir de
    0 : sans ça, supprimer la photo ordre=0 laisserait l'annonce sans photo
    principale identifiable alors que d'autres photos existent toujours
    (contrat §3.6 — ordre 0 = photo principale, source de vérité unique).
    """

    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = 'photo_id'

    def get_queryset(self):
        return Photo.objects.filter(
            annonce_id=self.kwargs['annonce_id'],
            annonce__proprietaire=self.request.user,
        )

    def perform_destroy(self, instance):
        if instance.annonce.statut != Annonce.StatutAnnonce.BROUILLON:
            raise PermissionDenied(
                "Impossible de supprimer une photo d'une annonce déjà en ligne."
            )
        with transaction.atomic():
            annonce_id = instance.annonce_id
            ordre_supprime = instance.ordre
            instance.delete()
            Photo.objects.filter(
                annonce_id=annonce_id, ordre__gt=ordre_supprime,
            ).update(ordre=F('ordre') - 1)
