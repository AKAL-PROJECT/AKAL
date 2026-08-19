# pyrefly: ignore [missing-import]
import uuid

from django.conf import settings
from django.db import models


# ──────────────────────────────────────────────
# FAVORI
# ──────────────────────────────────────────────

class Favori(models.Model):
    """Annonce mise en favori par un utilisateur."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='favoris'
    )
    annonce = models.ForeignKey(
        'annonces.Annonce', on_delete=models.CASCADE, related_name='favoris'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'favori'
        verbose_name = 'Favori'
        verbose_name_plural = 'Favoris'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'annonce'], name='unique_favori_user_annonce'
            )
        ]

    def __str__(self):
        return f"{self.user} ❤ {self.annonce}"


# ──────────────────────────────────────────────
# CONVERSATION
# ──────────────────────────────────────────────

class Conversation(models.Model):
    """
    Fil de discussion entre un utilisateur et le vendeur d'une annonce.

    Le destinataire est déductible : conversation.annonce.proprietaire.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    annonce = models.ForeignKey(
        'annonces.Annonce', on_delete=models.CASCADE, related_name='conversations'
    )
    initiateur = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='conversations_initiees'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'conversation'
        verbose_name = 'Conversation'
        verbose_name_plural = 'Conversations'
        constraints = [
            models.UniqueConstraint(
                fields=['annonce', 'initiateur'],
                name='uniq_conversation_annonce_initiateur'
            )
        ]

    def __str__(self):
        return f"Conversation {self.initiateur} → {self.annonce} ({self.annonce})"


# ──────────────────────────────────────────────
# MESSAGE
# ──────────────────────────────────────────────

class Message(models.Model):
    """Message envoyé dans une conversation."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name='messages'
    )
    auteur = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='messages_envoyes'
    )
    contenu = models.TextField()
    is_lu = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'message'
        verbose_name = 'Message'
        verbose_name_plural = 'Messages'
        ordering = ['created_at']

    def __str__(self):
        return f"Message de {self.auteur} — {self.contenu[:50]}"


# ──────────────────────────────────────────────
# NOTIFICATION
# ──────────────────────────────────────────────

class Notification(models.Model):
    """
    Notification adressée à un utilisateur (nouveau message, favori reçu,
    nouveau contact...). Générée par les signaux de messaging/signals.py,
    jamais créée directement depuis une vue — sauf ALERTE_RECHERCHE
    (2026-08-19), générée par annonces/alertes.py (app distincte, cf. son
    docstring pour pourquoi ce n'est pas ici malgré la remarque ci-dessus).
    """

    class TypeNotif(models.TextChoices):
        NOUVEAU_MESSAGE = 'nouveau_message', 'Nouveau message'
        NOUVEAU_FAVORI = 'nouveau_favori', 'Nouveau favori'
        CONTACT_RECU = 'contact_recu', 'Contact reçu'
        ALERTE_RECHERCHE = 'alerte_recherche', 'Alerte recherche sauvegardée'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    destinataire = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications'
    )
    # Nullable : une notification reste rattachable à une annonce pour le
    # contexte (cf. NotificationSerializer.annonce_id), mais rien n'empêche
    # un futur type de notification sans annonce associée.
    annonce = models.ForeignKey(
        'annonces.Annonce', on_delete=models.CASCADE, related_name='notifications',
        blank=True, null=True,
    )
    type_notif = models.CharField(max_length=30, choices=TypeNotif.choices)
    titre = models.CharField(max_length=200)
    message = models.TextField(blank=True, default='')
    is_lu = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notification'
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.type_notif} pour {self.destinataire}"
