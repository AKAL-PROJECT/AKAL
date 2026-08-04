"""
Serializers DRF pour l'app annonces.

Conformes au contrat d'API frontend/backend (§4.4, contrat v1.2) :
    - AnnonceListSerializer  → liste allégée (catalogue)
    - AnnonceDetailSerializer → détail complet (fiche annonce)

Sous-serializers :
    - RegionNestedSerializer     → {code, nom}
    - LocalisationListSerializer → {latitude, longitude}
    - LocalisationDetailSerializer → {latitude, longitude, adresse_approximative}
    - ParcelleListSerializer     → sous-objet parcelle (liste)
    - ParcelleDetailSerializer   → sous-objet parcelle (détail)
    - ProprietaireSerializer     → {id} (UUID uniquement, RGPD loi 09-08)
"""

# pyrefly: ignore [missing-import]
from django.contrib.gis.geos import Point, Polygon
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from . import transitions
from .models import Annonce, AgriScore, DonneesGeo, Parcelle, Photo


# ──────────────────────────────────────────────
# Sous-serializers (nested objects)
# ──────────────────────────────────────────────

class PhotoSerializer(serializers.ModelSerializer):
    """Photo avec URL absolue (champ `url`, cf. contrat §4.4)."""

    url = serializers.SerializerMethodField()

    class Meta:
        model = Photo
        fields = ['id', 'url', 'ordre']

    def get_url(self, obj):
        """Retourne l'URL absolue de l'image."""
        request = self.context.get('request')
        if obj.image and request:
            return request.build_absolute_uri(obj.image.url)
        elif obj.image:
            return obj.image.url
        return None


class AgriScoreListSerializer(serializers.ModelSerializer):
    """AgriScore allégé pour la vue liste — score_global uniquement."""

    class Meta:
        model = AgriScore
        fields = ['score_global']


class AgriScoreDetailSerializer(serializers.ModelSerializer):
    """AgriScore complet pour la vue détail."""

    class Meta:
        model = AgriScore
        fields = ['score_global', 'sous_scores', 'indice_confiance', 'version_ponderation', 'calculated_at']


class RegionNestedSerializer(serializers.Serializer):
    """Région sous forme {code, nom} — conforme au contrat §4.4."""

    code = serializers.CharField(read_only=True)
    nom = serializers.CharField(read_only=True)


class LocalisationListSerializer(serializers.Serializer):
    """Localisation allégée pour la vue liste — latitude/longitude uniquement."""

    latitude = serializers.FloatField(read_only=True)
    longitude = serializers.FloatField(read_only=True)


class LocalisationDetailSerializer(serializers.Serializer):
    """Localisation complète pour la vue détail — avec adresse_approximative."""

    latitude = serializers.FloatField(read_only=True)
    longitude = serializers.FloatField(read_only=True)
    adresse_approximative = serializers.CharField(read_only=True, allow_null=True)


class ParcelleListSerializer(serializers.ModelSerializer):
    """
    Sous-objet parcelle pour la vue liste (§4.4).

    Champs : id, surface_ha, statut_foncier, acces_eau, region, localisation.
    """

    region = serializers.SerializerMethodField()
    localisation = serializers.SerializerMethodField()

    class Meta:
        model = Parcelle
        fields = ['id', 'surface_ha', 'statut_foncier', 'acces_eau', 'region', 'localisation']

    def get_region(self, obj):
        """Retourne la région sous forme {code, nom}."""
        try:
            region = obj.commune.province.region
            return RegionNestedSerializer(region).data
        except AttributeError:
            return None

    def get_localisation(self, obj):
        """Retourne la localisation allégée (latitude, longitude)."""
        return LocalisationListSerializer({
            'latitude': obj.latitude,
            'longitude': obj.longitude,
        }).data


class ParcelleDetailSerializer(serializers.ModelSerializer):
    """Sous-objet parcelle pour la vue détail."""

    region = serializers.SerializerMethodField()
    province = serializers.CharField(source='commune.province.nom', read_only=True)
    commune = serializers.CharField(source='commune.nom', read_only=True)
    localisation = serializers.SerializerMethodField()

    class Meta:
        model = Parcelle
        fields = [
            'id', 'surface_ha', 'statut_foncier', 'acces_eau',
            'topographie', 'acces_routier',
            'metadata', 'region', 'province', 'commune', 'localisation',
        ]

    def get_region(self, obj):
        """Retourne la région sous forme {code, nom}."""
        try:
            region = obj.commune.province.region
            return RegionNestedSerializer(region).data
        except AttributeError:
            return None

    def get_localisation(self, obj):
        """Retourne la localisation complète avec adresse_approximative."""
        adresse = f"{obj.commune.nom}, Maroc" if hasattr(obj, 'commune') and obj.commune else None
        return LocalisationDetailSerializer({
            'latitude': obj.latitude,
            'longitude': obj.longitude,
            'adresse_approximative': adresse,
        }).data


class ProprietaireSerializer(serializers.Serializer):
    """
    Informations du propriétaire pour la vue détail.

    RGPD (loi 09-08) : expose UNIQUEMENT l'UUID, aucune donnée personnelle.
    """

    id = serializers.UUIDField(read_only=True)


# ──────────────────────────────────────────────
# Serializers principaux
# ──────────────────────────────────────────────

class AnnonceListSerializer(serializers.ModelSerializer):
    """
    Serializer liste allégée pour le catalogue (§4.4).

    Champs exposés (racine) :
        - Identité : id, slug, titre
        - Prix : prix_mad
        - Statut : statut
        - Média : photo_principale (URL de la photo ordre=0 ou null)
        - Score : score_courant (score_global seul ou null)
        - Date : created_at

    Sous-objet parcelle :
        - id, surface_ha, statut_foncier, acces_eau, region, localisation

    Jamais DonneesGeo dans la liste.
    """

    parcelle = ParcelleListSerializer(read_only=True)
    photo_principale = serializers.SerializerMethodField()
    score_courant = serializers.SerializerMethodField()

    class Meta:
        model = Annonce
        fields = [
            'id', 'slug', 'titre', 'prix_mad', 'statut',
            'score_courant', 'photo_principale', 'created_at',
            'parcelle',
        ]

    def get_photo_principale(self, obj):
        """
        Retourne l'URL absolue de la photo avec ordre=0, ou null.

        Les photos sont déjà prefetch_related, on filtre en Python
        pour éviter une requête SQL supplémentaire.
        """
        request = self.context.get('request')
        photos = obj.photos.all()  # Utilise le prefetch_related
        for photo in photos:
            if photo.ordre == 0:
                if request and photo.image:
                    return request.build_absolute_uri(photo.image.url)
                elif photo.image:
                    return photo.image.url
        return None

    def get_score_courant(self, obj):
        """
        Retourne {score_global} du dernier AgriScore, ou null.

        Utilise le prefetch_related('parcelle__scores') pour éviter N+1.
        Sélectionne le score le plus récent par created_at (contrat §3.5) —
        jamais calculated_at, qui est nullable et ne garantit pas l'ordre.
        """
        scores = obj.parcelle.scores.all()
        if scores:
            # Les scores sont déjà prefetchés, on trie en Python
            latest = max(scores, key=lambda s: s.created_at)
            return {'score_global': latest.score_global}
        return None


class AnnonceDetailSerializer(serializers.ModelSerializer):
    """
    Serializer détail complet pour la fiche annonce.

    Inclut tout ce qui est dans la liste plus :
        - description complète
        - sous-objet parcelle (données physiques + géo + localisation complète)
        - photos triées par ordre
        - score_courant complet (score_global + sous_scores + indice_confiance)
        - informations du propriétaire (UUID uniquement, RGPD)
    """

    parcelle = ParcelleDetailSerializer(read_only=True)
    photos = PhotoSerializer(many=True, read_only=True)
    score_courant = serializers.SerializerMethodField()
    proprietaire = ProprietaireSerializer(read_only=True)
    photo_principale = serializers.SerializerMethodField()

    class Meta:
        model = Annonce
        fields = [
            'id', 'slug', 'titre', 'description', 'prix_mad',
            'statut', 'loc_confidentielle',
            'date_publication', 'created_at', 'updated_at',
            'parcelle', 'photos', 'score_courant', 'proprietaire',
            'photo_principale',
        ]

    def get_score_courant(self, obj):
        """
        Retourne l'AgriScore complet ou null.

        Sélectionne le score le plus récent par created_at (contrat §3.5) —
        jamais calculated_at, qui est nullable et ne garantit pas l'ordre.
        Inclut score_global, sous_scores, indice_confiance, version_ponderation, calculated_at.
        """
        scores = obj.parcelle.scores.all()
        if scores:
            latest = max(scores, key=lambda s: s.created_at)
            return AgriScoreDetailSerializer(latest).data
        return None

    def get_photo_principale(self, obj):
        """Retourne l'URL absolue de la photo avec ordre=0, ou null."""
        request = self.context.get('request')
        photos = obj.photos.all()
        for photo in photos:
            if photo.ordre == 0:
                if request and photo.image:
                    return request.build_absolute_uri(photo.image.url)
                elif photo.image:
                    return photo.image.url
        return None


# ──────────────────────────────────────────────
# Écriture — dépôt d'annonce (F03)
# ──────────────────────────────────────────────
#
# Distincts des serializers de lecture ci-dessus (jamais réutilisés pour
# l'écriture : les DTO publics sont volontairement allégés/anonymisés,
# l'écriture a des besoins différents — cf. décisions du 2026-07-28).

class ParcelleEcritureSerializer(serializers.ModelSerializer):
    """
    Champs Parcelle modifiables via le dépôt d'annonce.

    `commune`/`latitude`/`longitude` restent optionnels ici : un brouillon
    peut exister sans localisation (étape 1 du formulaire précède l'étape
    2 "Localisation"). `geom` n'est jamais un champ d'entrée — reconstruit
    serveur depuis latitude/longitude dans AnnonceEcritureSerializer, pour
    ne jamais demander au client de manipuler du GeoJSON/WKT directement.

    `contour` (RC 2026-08-04) : sommets du polygone dessiné par le vendeur en
    mode "Polygone" du picker carte, `[[lat, lng], ...]`, ≥3 points — ne
    remplace pas latitude/longitude (le frontend soumet toujours un point,
    son centroïde côté client, en plus du contour), donc aucun changement
    requis à Parcelle.is_geolocated()/Annonce.can_publish(). N'existe pas
    sur le modèle Parcelle (vit sur DonneesGeo.contour, OneToOne) : jamais
    assigné par le ModelSerializer par défaut, géré à la main par
    AnnonceEcritureSerializer._appliquer_contour(). write_only côté
    déclaration DRF (pour éviter que to_representation() par défaut tente
    de lire un attribut `contour` inexistant sur Parcelle) — la valeur de
    lecture est réinjectée manuellement par to_representation() ci-dessous.
    Volontairement jamais exposé sur les serializers de lecture publics
    (ParcelleListSerializer/ParcelleDetailSerializer) : seul le propriétaire,
    via AnnonceUpdateAPIView, peut le relire — même logique de confidentialité
    que la position exacte, jamais montrée telle quelle publiquement non plus.
    """

    contour = serializers.ListField(
        child=serializers.ListField(child=serializers.FloatField(), min_length=2, max_length=2),
        required=False, allow_null=True, write_only=True,
    )

    class Meta:
        model = Parcelle
        fields = [
            'surface_ha', 'statut_foncier', 'acces_eau', 'topographie', 'acces_routier',
            'commune', 'latitude', 'longitude', 'contour',
        ]
        extra_kwargs = {
            'commune': {'required': False, 'allow_null': True},
            'latitude': {'required': False, 'allow_null': True},
            'longitude': {'required': False, 'allow_null': True},
        }

    def validate_contour(self, value):
        if value is not None and len(value) < 3:
            raise serializers.ValidationError('Un contour doit avoir au moins 3 sommets.')
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        donnees_geo = getattr(instance, 'donnees_geo', None)
        if donnees_geo is None:
            data['contour'] = None
        else:
            # exterior_ring.coords ferme le polygone (premier == dernier) et
            # est en (lng, lat) côté PostGIS — inversé ici pour retrouver le
            # [lat, lng] envoyé par le frontend, sans le point de fermeture
            # (le frontend referme lui-même le tracé à l'affichage).
            coords = list(donnees_geo.contour.exterior_ring.coords)[:-1]
            data['contour'] = [[lat, lng] for lng, lat in coords]
        return data


class AnnonceEcritureSerializer(serializers.ModelSerializer):
    """
    Création + édition partielle d'une annonce (dépôt F03).

    - Le statut n'est jamais choisi par le client à la création : forcé
      BROUILLON côté vue (AnnonceListCreateAPIView.perform_create).
    - En PATCH, les transitions de statut autorisées sont gouvernées par le
      graphe unique de annonces/transitions.py (P2 — 2026-07-30) — jamais
      vérifiées ici. Toute transition entrante vers en_ligne (quelle que
      soit son origine dans le graphe) reste en plus soumise à
      Annonce.can_publish() (contrat §6.1, géoloc/photo/prix), cf. update()
      ci-dessous.
    - `parcelle` est un sous-objet imbriqué (même forme que les serializers
      de lecture) ; latitude/longitude sont converties en géométrie
      PostGIS ici, jamais exposées en écriture brute côté Parcelle.
    - `photos` est exposé en lecture seule (jamais en écriture ici — l'ajout
      de photos passe par AnnonceUpdateAPIView.patch(), pas par ce champ) :
      le formulaire 3 étapes du front doit pouvoir réafficher les photos déjà
      déposées quand l'utilisateur revient sur un brouillon.
    """

    parcelle = ParcelleEcritureSerializer(required=False)
    photos = PhotoSerializer(many=True, read_only=True)

    class Meta:
        model = Annonce
        fields = [
            'id', 'slug', 'titre', 'description', 'prix_mad', 'statut',
            'loc_confidentielle', 'parcelle', 'photos',
        ]
        read_only_fields = ['id', 'slug']

    # Seule barrière sur le champ `statut` — volontairement séparée de
    # l'édition du reste du contenu (titre, prix, parcelle, photos), qui
    # n'est soumise à aucune restriction de statut ici (cf. docstring
    # AnnonceUpdateAPIView). Ne pas étendre cette méthode pour valider
    # autre chose que des transitions de statut — le graphe lui-même vit
    # dans annonces/transitions.py, pas ici.
    def validate_statut(self, value):
        if self.instance is None:
            return value  # ignoré à la création (forcé BROUILLON par la vue)
        if value == self.instance.statut:
            return value
        if not transitions.transition_autorisee(self.instance.statut, value):
            raise serializers.ValidationError(
                f"Transition « {self.instance.statut} → {value} » non autorisée."
            )
        return value

    @staticmethod
    def _appliquer_parcelle(parcelle, parcelle_data):
        """Applique les champs Parcelle, reconstruit `geom` si lat/lng fournis.

        `contour` est retiré ici (jamais un champ du modèle Parcelle) mais
        PAS traité dans cette méthode : il nécessite parcelle.pk (FK
        OneToOne DonneesGeo), donc géré séparément par _appliquer_contour(),
        appelée après le .save() de la parcelle par create()/update().
        """
        lat = parcelle_data.pop('latitude', None)
        lng = parcelle_data.pop('longitude', None)
        parcelle_data.pop('contour', None)
        for champ, valeur in parcelle_data.items():
            setattr(parcelle, champ, valeur)
        if lat is not None and lng is not None:
            parcelle.latitude = lat
            parcelle.longitude = lng
            parcelle.geom = Point(lng, lat, srid=4326)

    @staticmethod
    def _appliquer_contour(parcelle, contour):
        """Crée/remplace le DonneesGeo.contour associé si un contour est
        fourni — même convention que geom pour latitude/longitude ci-dessus :
        une valeur absente ou nulle est un no-op, jamais un effacement
        implicite (pas de suppression de contour via ce endpoint pour l'instant)."""
        if not contour:
            return
        points = [(lng, lat) for lat, lng in contour]
        points.append(points[0])  # ferme l'anneau (PostGIS l'exige)
        DonneesGeo.objects.update_or_create(parcelle=parcelle, defaults={'contour': Polygon(points, srid=4326)})

    def create(self, validated_data):
        parcelle_data = validated_data.pop('parcelle', {})
        validated_data.pop('statut', None)  # forcé BROUILLON par la vue, jamais par le client

        parcelle = Parcelle()
        contour = parcelle_data.get('contour')
        self._appliquer_parcelle(parcelle, parcelle_data)
        parcelle.save()
        self._appliquer_contour(parcelle, contour)

        return Annonce.objects.create(
            parcelle=parcelle, statut=Annonce.StatutAnnonce.BROUILLON, **validated_data
        )

    def update(self, instance, validated_data):
        parcelle_data = validated_data.pop('parcelle', None)
        nouveau_statut = validated_data.get('statut')
        statut_avant = instance.statut  # capturé avant toute mutation ci-dessous

        with transaction.atomic():
            if parcelle_data:
                contour = parcelle_data.get('contour')
                self._appliquer_parcelle(instance.parcelle, parcelle_data)
                instance.parcelle.save()
                self._appliquer_contour(instance.parcelle, contour)

            for champ, valeur in validated_data.items():
                setattr(instance, champ, valeur)

            publie_maintenant = (
                nouveau_statut == Annonce.StatutAnnonce.EN_LIGNE
                and statut_avant != Annonce.StatutAnnonce.EN_LIGNE
            )
            if publie_maintenant:
                # Vérifie can_publish() sur l'état déjà appliqué en mémoire
                # (parcelle + champs ci-dessus), avant tout .save() — la
                # transaction ne persiste rien si ça échoue.
                ok, raisons = instance.can_publish()
                if not ok:
                    raise serializers.ValidationError({'statut': raisons})
                instance.date_publication = timezone.now()

            instance.save()

        return instance


# ──────────────────────────────────────────────
# STATISTIQUES — Dashboard propriétaire
# ──────────────────────────────────────────────

class MesStatistiquesSerializer(serializers.Serializer):
    """
    Statistiques du propriétaire connecté, hors décompte par statut
    d'annonce (déjà dérivable côté front depuis GET /mes-annonces/, cf.
    MesStatistiquesAPIView dans api_views.py — pas de duplication ici).

    favoris_recus         → favoris posés par d'autres utilisateurs sur les
                             annonces du propriétaire (sens inverse de
                             GET /api/favoris/, qui liste SES propres favoris).
    conversations_recues  → fils ouverts par des acheteurs sur ses annonces
                             (exclut les conversations qu'il a lui-même
                             initiées en tant qu'acheteur ailleurs).
    messages_non_lus      → messages non lus reçus dans ces conversations,
                             jamais ses propres messages (même logique que
                             ConversationListSerializer.get_messages_non_lus()
                             dans messaging/serializers.py, mais en agrégat
                             global plutôt que par conversation).
    """

    favoris_recus = serializers.IntegerField(read_only=True)
    conversations_recues = serializers.IntegerField(read_only=True)
    messages_non_lus = serializers.IntegerField(read_only=True)
