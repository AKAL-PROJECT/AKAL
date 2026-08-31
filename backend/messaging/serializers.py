"""
Serializers DRF pour l'app messaging — F05 (messagerie interne, polling) et Favoris.

Vocabulaire (décision F05 du 2026-07-28) : on garde `initiateur` tel quel,
jamais traduit en acheteur/vendeur — le second participant d'une conversation
est toujours déduit via `conversation.annonce.proprietaire`, jamais stocké.

    - ParticipantSerializer       → {id, prenom} d'un utilisateur dans une conversation
    - AnnonceResumeSerializer     → résumé minimal de l'annonce pour l'inbox
    - MessageSerializer           → un message (lecture)
    - ConversationListSerializer  → un fil, tel que listé dans l'inbox
    - EnvoyerMessageSerializer    → POST /api/conversations/ (démarre un fil, get-or-create)
    - EnvoyerReponseSerializer    → POST /api/conversations/<id>/messages/ (répond dans un fil existant)
    - FavoriSerializer            → un favori (lecture)
"""

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from annonces.models import Annonce
from annonces.serializers import AnnonceListSerializer
from .models import Conversation, Favori, Message, Notification


# ──────────────────────────────────────────────
# Conversations / Messages (F05)
# ──────────────────────────────────────────────

class ParticipantSerializer(serializers.Serializer):
    """
    {id, prenom} — décision F05 du 2026-07-28 : le prénom seul est exposé
    dans une conversation. Différent de ProprietaireSerializer (catalogue
    public, UUID seul, RGPD loi 09-08) : une conversation est un contact
    privé mutuel déjà établi entre deux utilisateurs, pas une exposition au
    tout-venant — le prénom seul reste un compromis raisonnable (jamais nom,
    email ou téléphone).
    """

    id = serializers.UUIDField(read_only=True)
    prenom = serializers.CharField(read_only=True)


class AnnonceResumeSerializer(serializers.ModelSerializer):
    """Résumé minimal de l'annonce pour l'affichage dans l'inbox — jamais le détail complet."""

    photo_principale = serializers.SerializerMethodField()

    class Meta:
        model = Annonce
        fields = ['id', 'slug', 'titre', 'photo_principale']

    def get_photo_principale(self, obj):
        """Utilise le prefetch_related('annonce__photos') de la vue — jamais de requête N+1."""
        request = self.context.get('request')
        for photo in obj.photos.all():
            if photo.ordre == 0:
                return request.build_absolute_uri(photo.image.url) if request and photo.image else None
        return None


class MessageSerializer(serializers.ModelSerializer):
    auteur = ParticipantSerializer(read_only=True)

    class Meta:
        model = Message
        fields = ['id', 'auteur', 'contenu', 'is_lu', 'created_at']
        read_only_fields = fields


class ConversationListSerializer(serializers.ModelSerializer):
    """
    Un fil tel que listé dans l'inbox. `autre_participant` et
    `messages_non_lus` dépendent de l'utilisateur courant (`request.user`
    dans le contexte) — jamais absolus, toujours relatifs à qui consulte.
    """

    annonce = AnnonceResumeSerializer(read_only=True)
    autre_participant = serializers.SerializerMethodField()
    dernier_message = serializers.SerializerMethodField()
    messages_non_lus = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ['id', 'annonce', 'autre_participant', 'dernier_message', 'messages_non_lus', 'updated_at']

    def get_autre_participant(self, obj):
        utilisateur = self.context['request'].user
        autre = obj.annonce.proprietaire if obj.initiateur_id == utilisateur.id else obj.initiateur
        return ParticipantSerializer(autre).data

    def get_dernier_message(self, obj):
        # obj.messages.all() utilise le prefetch_related de la vue — trié par
        # created_at croissant (Message.Meta.ordering), le dernier élément
        # est donc le message le plus récent.
        messages = list(obj.messages.all())
        if not messages:
            return None
        dernier = messages[-1]
        return {'contenu': dernier.contenu, 'created_at': dernier.created_at, 'auteur_id': dernier.auteur_id}

    def get_messages_non_lus(self, obj):
        utilisateur = self.context['request'].user
        return sum(1 for m in obj.messages.all() if not m.is_lu and m.auteur_id != utilisateur.id)


class EnvoyerMessageSerializer(serializers.Serializer):
    """
    POST /api/conversations/ — démarre le contact depuis une fiche annonce.

    Réutilisation de conversation existante — comportement exact :
    ce endpoint est idempotent sur la paire (annonce, initiateur=request.user).
    Chaque appel fait un get_or_create() sur cette paire :
      - 1er appel jamais fait pour cette paire → une nouvelle Conversation
        est créée, avec ce premier message dedans.
      - Appel(s) suivant(s) pour la MÊME paire (annonce, initiateur) → AUCUNE
        nouvelle Conversation n'est créée ; le message est simplement ajouté
        à la Conversation déjà existante. Le POST renvoie dans les deux cas
        le même objet Conversation (même id), seul le nombre de messages
        qu'il contient change.
    Ce n'est pas une garantie applicative fragile : c'est imposé au niveau
    base par UniqueConstraint(['annonce', 'initiateur'],
    name='uniq_conversation_annonce_initiateur') sur le modèle Conversation
    (déjà en place avant F05, cf. migration messaging.0002) — deux lignes
    Conversation pour la même paire sont impossibles en base, get_or_create()
    ne fait qu'exploiter cette contrainte plutôt que la dupliquer en code.

    Décision F05 du 2026-07-28 : la Conversation n'existe qu'à partir du
    premier message envoyé, jamais créée « à vide » par un simple clic sur
    « Contacter ». N'est utilisable QUE par l'initiateur — le propriétaire de
    l'annonce ne peut pas se contacter lui-même (validate_annonce), et pour
    répondre dans un fil déjà ouvert, c'est EnvoyerReponseSerializer
    (adressé par id de conversation) qui s'applique, pas celui-ci — cf. sa
    docstring pour pourquoi ce même get_or_create ne peut pas aussi servir
    aux réponses du propriétaire.
    """

    annonce = serializers.PrimaryKeyRelatedField(queryset=Annonce.objects.en_ligne())
    contenu = serializers.CharField(max_length=4000, trim_whitespace=True)

    def validate_contenu(self, value):
        if not value.strip():
            raise serializers.ValidationError("Le message ne peut pas être vide.")
        return value

    def validate_annonce(self, annonce):
        utilisateur = self.context['request'].user
        # Annonces importées d'une source externe (Avito/Mubawab, cf.
        # Annonce.Source) : le "propriétaire" est un compte bot d'import,
        # jamais un vrai vendeur joignable — ouvrir une conversation AKAL
        # créerait un fil sans destinataire réel. Hardening 2026-08-31 : on
        # refuse la création de conversation (le CTA est aussi masqué côté
        # front, cf. FicheParcelle.tsx / estSourceExterne). Sans effet sur
        # le catalogue de démo (AKAL_DATASET='simulated' = source=interne
        # uniquement) — garde-fou pour tout dataset qui exposerait le scrapé.
        if annonce.source != Annonce.Source.INTERNE:
            raise serializers.ValidationError(
                "Cette annonce provient d'une source externe : la messagerie AKAL n'est pas "
                "disponible pour la contacter. Reportez-vous à l'annonce d'origine."
            )
        if annonce.proprietaire_id == utilisateur.id:
            raise serializers.ValidationError(
                "Vous ne pouvez pas vous contacter vous-même sur votre propre annonce."
            )
        return annonce

    def create(self, validated_data):
        utilisateur = self.context['request'].user
        annonce = validated_data['annonce']
        with transaction.atomic():
            # get_or_create sur la même paire (annonce, initiateur) que la
            # UniqueConstraint DB — `_created` ignoré volontairement : que ce
            # soit un nouveau fil ou un fil réutilisé, la suite (créer le
            # message, remonter updated_at) est rigoureusement identique.
            conversation, _created = Conversation.objects.get_or_create(
                annonce=annonce, initiateur=utilisateur,
            )
            Message.objects.create(
                conversation=conversation, auteur=utilisateur, contenu=validated_data['contenu'],
            )
            # Sans ça, envoyer un message ne remonterait jamais le fil en
            # tête de liste (GET /api/conversations/ trie par -updated_at).
            conversation.updated_at = timezone.now()
            conversation.save(update_fields=['updated_at'])
        return conversation

    def to_representation(self, instance):
        # `instance` est la Conversation retournée par create() — même forme
        # que la liste, pour que le front puisse mettre à jour l'inbox
        # directement avec la réponse du POST, sans second aller-retour GET.
        return ConversationListSerializer(instance, context=self.context).data


class EnvoyerReponseSerializer(serializers.Serializer):
    """
    POST /api/conversations/<id>/messages/ — répond dans un fil déjà ouvert.

    Utilisable par les deux participants (contrairement à
    EnvoyerMessageSerializer, réservé à l'initiateur). La conversation est
    résolue par la vue (scoping par queryset, cf. api_views.py) et injectée
    dans le contexte — jamais dans le payload, l'id est déjà dans l'URL.

    Pourquoi un serializer séparé plutôt que de réutiliser le get_or_create
    de EnvoyerMessageSerializer pour toute réponse : ce dernier est keyé sur
    (annonce, initiateur=request.user). Si le PROPRIÉTAIRE de l'annonce
    l'appelait pour répondre, il ne serait jamais l'initiateur du fil
    existant (par définition), donc get_or_create() créerait à tort une
    DEUXIÈME Conversation (annonce, initiateur=propriétaire) au lieu de
    réutiliser celle où il est censé répondre — en plus d'être bloqué par le
    garde-fou auto-contact de EnvoyerMessageSerializer, qui n'a pas lieu
    d'être ici. D'où l'adressage par id de conversation, universel pour les
    deux participants, sans get_or_create ni garde-fou d'auto-contact.
    """

    contenu = serializers.CharField(max_length=4000, trim_whitespace=True)

    def validate_contenu(self, value):
        if not value.strip():
            raise serializers.ValidationError("Le message ne peut pas être vide.")
        return value

    def create(self, validated_data):
        utilisateur = self.context['request'].user
        conversation = self.context['conversation']
        with transaction.atomic():
            message = Message.objects.create(
                conversation=conversation, auteur=utilisateur, contenu=validated_data['contenu'],
            )
            conversation.updated_at = timezone.now()
            conversation.save(update_fields=['updated_at'])
        return message

    def to_representation(self, instance):
        return MessageSerializer(instance, context=self.context).data


# ──────────────────────────────────────────────
# Favoris
# ──────────────────────────────────────────────

class FavoriSerializer(serializers.ModelSerializer):
    """
    `annonce` nesté via AnnonceListSerializer (même forme que le catalogue) —
    ajouté pour permettre à /favoris/ d'afficher une vraie grille de cartes
    côté front sans un second aller-retour par annonce.
    """

    annonce = AnnonceListSerializer(read_only=True)

    class Meta:
        model = Favori
        fields = ['id', 'annonce', 'created_at']
        read_only_fields = ['id', 'created_at']


# ──────────────────────────────────────────────
# Notifications
# ──────────────────────────────────────────────

class NotificationSerializer(serializers.ModelSerializer):
    """
    Une notification (lecture ET écriture partielle) — seul `is_lu` est
    modifiable (absent de `read_only_fields`), réutilisé tel quel par
    NotificationListAPIView (lecture) et NotificationMarkLuAPIView (PATCH
    `{"is_lu": true}`, cf. api_views.py) : ListAPIView n'appelle jamais
    `.update()`, donc aucun risque qu'un GET laisse passer une écriture.
    """

    annonce_id = serializers.UUIDField(source='annonce.id', read_only=True, default=None)

    class Meta:
        model = Notification
        fields = ['id', 'type_notif', 'titre', 'message', 'annonce_id', 'is_lu', 'created_at']
        read_only_fields = ['id', 'type_notif', 'titre', 'message', 'annonce_id', 'created_at']
