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

# Sentinelle distincte de `None` : `_appliquer_parcelle` doit pouvoir
# distinguer "le client n'a pas touché au champ `contour`" (ne rien changer)
# de "le client a explicitement envoyé `contour: []`" (repasser en mode
# Point, retirer le contour existant) — cf. décision du 2026-08-05.
_CONTOUR_INCHANGE = object()


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
        """
        Retourne la région sous forme {code, nom} — priorité au référentiel
        géométrique officiel (`commune_geom`, 2026-08-06) si renseigné,
        repli sur l'ancien référentiel (`commune`) sinon, pour ne pas casser
        l'affichage des annonces déjà publiées avant son introduction. `code`
        reste toujours le slug (jamais le code HCP numérique interne) — le
        contrat public ne change pas selon la chaîne d'origine.
        """
        if obj.commune_geom_id:
            region = obj.commune_geom.province.region
            return RegionNestedSerializer({'code': region.slug, 'nom': region.nom}).data
        try:
            return RegionNestedSerializer(obj.commune.province.region).data
        except AttributeError:
            return None

    def get_localisation(self, obj):
        """Retourne la localisation allégée (latitude, longitude)."""
        return LocalisationListSerializer({
            'latitude': obj.latitude,
            'longitude': obj.longitude,
        }).data


class ParcelleDetailSerializer(serializers.ModelSerializer):
    """
    Sous-objet parcelle pour la vue détail.

    `region`/`province`/`commune` : SerializerMethodField (pas de `source=`
    direct) pour pouvoir arbitrer entre `commune_geom` (référentiel officiel)
    et `commune` (legacy) — cf. get_region() ci-dessous.
    """

    region = serializers.SerializerMethodField()
    province = serializers.SerializerMethodField()
    commune = serializers.SerializerMethodField()
    localisation = serializers.SerializerMethodField()

    class Meta:
        model = Parcelle
        fields = [
            'id', 'surface_ha', 'statut_foncier', 'acces_eau',
            'topographie', 'acces_routier',
            'metadata', 'region', 'province', 'commune', 'localisation',
        ]

    def get_region(self, obj):
        """Retourne la région sous forme {code, nom} — cf. ParcelleListSerializer.get_region()."""
        if obj.commune_geom_id:
            region = obj.commune_geom.province.region
            return RegionNestedSerializer({'code': region.slug, 'nom': region.nom}).data
        try:
            return RegionNestedSerializer(obj.commune.province.region).data
        except AttributeError:
            return None

    def get_province(self, obj):
        if obj.commune_geom_id:
            return obj.commune_geom.province.nom
        if obj.commune_id:
            return obj.commune.province.nom
        return None

    def get_commune(self, obj):
        if obj.commune_geom_id:
            return obj.commune_geom.nom_affichage
        if obj.commune_id:
            return obj.commune.nom
        return None

    def get_localisation(self, obj):
        """Retourne la localisation complète avec adresse_approximative."""
        nom_commune = self.get_commune(obj)
        adresse = f"{nom_commune}, Maroc" if nom_commune else None
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

class PointContourSerializer(serializers.Serializer):
    """
    Un sommet du contour polygonal, en {latitude, longitude} — jamais de
    GeoJSON brut côté client (même convention que latitude/longitude du
    point unique, cf. AnnonceEcritureSerializer._appliquer_parcelle).
    """

    latitude = serializers.FloatField()
    longitude = serializers.FloatField()


def _contour_en_points(parcelle):
    """
    Convertit DonneesGeo.contour (GEOS Polygon, anneau fermé) en liste de
    sommets {latitude, longitude} tels que saisis par l'utilisateur — sans
    le sommet de fermeture dupliqué (contrainte interne PostGIS/GEOS, pas
    une donnée métier). Retourne None si la parcelle n'a pas de contour.
    """
    donnees_geo = getattr(parcelle, 'donnees_geo', None)
    if donnees_geo is None or donnees_geo.contour is None:
        return None
    anneau = donnees_geo.contour.coords[0]  # [(lng, lat), ..., (lng0, lat0)]
    return [{'latitude': lat, 'longitude': lng} for lng, lat in anneau[:-1]]


class ParcelleEcritureSerializer(serializers.ModelSerializer):
    """
    Champs Parcelle modifiables via le dépôt d'annonce.

    `commune`/`latitude`/`longitude` restent optionnels ici : un brouillon
    peut exister sans localisation (étape 1 du formulaire précède l'étape
    2 "Localisation"). `geom` n'est jamais un champ d'entrée — reconstruit
    serveur depuis latitude/longitude dans AnnonceEcritureSerializer, pour
    ne jamais demander au client de manipuler du GeoJSON/WKT directement.

    `contour` (dessin de parcelle, 2026-08-05) : optionnel, liste de sommets
    {latitude, longitude} — même convention anti-GeoJSON. N'est pas un champ
    du modèle Parcelle (porté par DonneesGeo, OneToOne) : construit/validé
    par AnnonceEcritureSerializer._finaliser_contour(), jamais par le
    ModelSerializer standard. `to_representation` le recalcule depuis
    `donnees_geo.contour` pour que l'étape Localisation puisse se
    re-préremplir sur un brouillon déjà dessiné.

    `commune_geom` (référentiel géométrique officiel, 2026-08-06) : c'est ce
    champ, pas l'ancien `commune`, qui alimente désormais `is_geolocated()`/
    `can_publish()`. Les deux coexistent sur Parcelle — `commune` n'est
    jamais rétro-rempli ni retiré (cf. docs/plans/2026-08-06-communes-geo-design.md).
    `commune_geom` n'a aucune interaction avec `contour` : on peut dessiner
    un polygone dans n'importe quelle commune officielle choisie, les deux
    fonctionnalités sont indépendantes.
    """

    contour = PointContourSerializer(many=True, required=False, allow_null=True)

    class Meta:
        model = Parcelle
        fields = [
            'surface_ha', 'statut_foncier', 'acces_eau', 'topographie', 'acces_routier',
            'commune', 'commune_geom', 'latitude', 'longitude', 'contour',
        ]
        extra_kwargs = {
            'commune': {'required': False, 'allow_null': True},
            'commune_geom': {'required': False, 'allow_null': True},
            'latitude': {'required': False, 'allow_null': True},
            'longitude': {'required': False, 'allow_null': True},
        }

    def to_representation(self, instance):
        # `contour` n'est pas un attribut de Parcelle : le ModelSerializer
        # standard le saute silencieusement (SkipField, champ required=False
        # sans valeur résolvable) — on le recalcule nous-mêmes ici plutôt que
        # de laisser une valeur par défaut ambiguë.
        data = super().to_representation(instance)
        data['contour'] = _contour_en_points(instance)
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
        """
        Applique les champs Parcelle, reconstruit `geom` si lat/lng fournis.

        Retourne le `contour` transmis par le client (liste de sommets
        validés par PointContourSerializer), ou la sentinelle
        `_CONTOUR_INCHANGE` si le champ était absent du payload — la pose
        effective du contour est différée à `_finaliser_contour()`, appelée
        après `parcelle.save()` (le lien OneToOne DonneesGeo → Parcelle exige
        une PK).
        """
        lat = parcelle_data.pop('latitude', None)
        lng = parcelle_data.pop('longitude', None)
        contour = parcelle_data.pop('contour', _CONTOUR_INCHANGE)
        for champ, valeur in parcelle_data.items():
            setattr(parcelle, champ, valeur)
        if lat is not None and lng is not None:
            parcelle.latitude = lat
            parcelle.longitude = lng
            parcelle.geom = Point(lng, lat, srid=4326)
        return contour

    @staticmethod
    def _finaliser_contour(parcelle, contour):
        """
        Pose/retire le contour polygonal (DonneesGeo) puis, si aucun point
        manuel n'est déjà posé sur la parcelle, dérive son repère
        (latitude/longitude/geom) du centroïde géométrique du contour — un
        point déjà renseigné (manuel ou issu d'un centroïde précédent) n'est
        jamais écrasé (décision du 2026-08-05, cf. EtapeLocalisation).

        `contour` :
            - `_CONTOUR_INCHANGE` (champ absent du payload) → ne touche à rien ;
            - `[]` (0 sommet, explicite) → repasse en mode Point, retire le
              contour existant s'il y en avait un ;
            - liste de ≥3 sommets distincts formant un polygone valide → pose
              le contour. Rejet strict (400) sinon — jamais de réparation
              automatique (make_valid/buffer(0)) d'un tracé manuel invalide :
              on redemande explicitement à l'utilisateur de redessiner.
        """
        if contour is _CONTOUR_INCHANGE:
            return
        if not contour:
            DonneesGeo.objects.filter(parcelle=parcelle).delete()
            return

        # Dédoublonne en conservant l'ordre — deux sommets consécutifs
        # identiques (double-clic accidentel) ne comptent que pour un seul
        # point réel du tracé.
        sommets = [(p['longitude'], p['latitude']) for p in contour]
        sommets_distincts = list(dict.fromkeys(sommets))
        if len(sommets_distincts) < 3:
            raise serializers.ValidationError({
                'parcelle': {'contour': ["Un polygone nécessite au moins 3 sommets distincts."]}
            })

        anneau = sommets_distincts + [sommets_distincts[0]]  # ferme l'anneau, exigé par GEOS
        polygon = Polygon(anneau, srid=4326)
        if not polygon.valid:
            raise serializers.ValidationError({
                'parcelle': {'contour': [
                    "Le contour dessiné est invalide (segments qui se croisent). Veuillez le redessiner."
                ]}
            })

        DonneesGeo.objects.update_or_create(parcelle=parcelle, defaults={'contour': polygon})

        if parcelle.latitude is None or parcelle.longitude is None:
            centroide = polygon.centroid
            parcelle.latitude = centroide.y
            parcelle.longitude = centroide.x
            parcelle.geom = Point(centroide.x, centroide.y, srid=4326)
            parcelle.save(update_fields=['latitude', 'longitude', 'geom'])

    def create(self, validated_data):
        parcelle_data = validated_data.pop('parcelle', {})
        validated_data.pop('statut', None)  # forcé BROUILLON par la vue, jamais par le client

        # Transaction explicite (absente avant l'ajout du contour) : un
        # contour invalide lève une ValidationError depuis
        # _finaliser_contour(), *après* parcelle.save() — sans elle, la
        # Parcelle resterait committée en base sans Annonce pour la
        # référencer.
        with transaction.atomic():
            parcelle = Parcelle()
            contour = self._appliquer_parcelle(parcelle, parcelle_data)
            parcelle.save()
            self._finaliser_contour(parcelle, contour)

            return Annonce.objects.create(
                parcelle=parcelle, statut=Annonce.StatutAnnonce.BROUILLON, **validated_data
            )

    def update(self, instance, validated_data):
        parcelle_data = validated_data.pop('parcelle', None)
        nouveau_statut = validated_data.get('statut')
        statut_avant = instance.statut  # capturé avant toute mutation ci-dessous

        with transaction.atomic():
            if parcelle_data:
                contour = self._appliquer_parcelle(instance.parcelle, parcelle_data)
                instance.parcelle.save()
                self._finaliser_contour(instance.parcelle, contour)

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
    vues_totales           → somme de StatistiqueAnnonce.vues sur toutes les
                             annonces du propriétaire. Ajout du 2026-08-10 —
                             vaut 0 pour tout le monde tant qu'aucun
                             mécanisme n'incrémente StatistiqueAnnonce (le
                             modèle existe déjà, mais rien ne l'alimente
                             encore) ; champ ajouté par anticipation.
    """

    favoris_recus = serializers.IntegerField(read_only=True)
    conversations_recues = serializers.IntegerField(read_only=True)
    messages_non_lus = serializers.IntegerField(read_only=True)
    vues_totales = serializers.IntegerField(read_only=True)
