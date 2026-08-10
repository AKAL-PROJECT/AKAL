"""
Signaux de l'app messaging — génèrent une Notification sur les événements
métier suivants :
    - nouveau message dans une conversation → l'autre participant
    - nouveau favori posé sur une annonce   → le propriétaire de l'annonce
    - nouveau fil de discussion ouvert      → le propriétaire de l'annonce

Câblés via MessagingConfig.ready() (apps.py) — jamais importés ailleurs
directement (convention Django standard pour les signaux d'une app).

Note (2026-08-10, repris depuis origin/feat/notifications) : un signal
« annonce modifiée » (notifier un changement de statut, ex. publication) a
été envisagé dans la version d'origine mais jamais implémenté (corps vide,
commentaire FIXME) — post_save seul ne permet pas de distinguer une création
d'une simple mise à jour de statut sans tracker de champ dédié
(django-model-utils FieldTracker ou équivalent) ; l'ajouter sans ce tracker
notifierait à chaque save() de l'annonce, y compris sur des changements sans
rapport (titre, prix...). Volontairement exclu de cette V2 pour la même
raison — à construire proprement si le besoin se confirme, pas ici.
`Notification.TypeNotif` ne déclare donc pas de valeur ANNONCE_MODIFIEE tant
que ce signal n'existe pas : un type inutilisé serait trompeur.

Note sur le démarrage d'une conversation (EnvoyerMessageSerializer.create(),
messaging/serializers.py) : la création de la Conversation ET du premier
Message déclenchent chacune leur propre signal ci-dessous → le propriétaire
reçoit volontairement DEUX notifications distinctes (CONTACT_RECU puis
NOUVEAU_MESSAGE) au premier contact. Comportement hérité de la version
d'origine, conservé tel quel (deux événements métier distincts, pas un
doublon) — cf. tests.
"""

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Conversation, Favori, Message, Notification


@receiver(post_save, sender=Message)
def notifier_nouveau_message(sender, instance, created, **kwargs):
    """Notifie l'autre participant de la conversation à chaque nouveau message."""
    if not created:
        return

    conversation = instance.conversation
    annonce = conversation.annonce
    destinataire = (
        annonce.proprietaire if instance.auteur_id == conversation.initiateur_id else conversation.initiateur
    )

    Notification.objects.create(
        destinataire=destinataire,
        annonce=annonce,
        type_notif=Notification.TypeNotif.NOUVEAU_MESSAGE,
        titre=f"Nouveau message de {instance.auteur.prenom}",
        message=instance.contenu[:50] + ('...' if len(instance.contenu) > 50 else ''),
    )


@receiver(post_save, sender=Favori)
def notifier_nouveau_favori(sender, instance, created, **kwargs):
    """Notifie le propriétaire quand son annonce est mise en favori (jamais sur son propre favori)."""
    if not created:
        return

    annonce = instance.annonce
    if instance.user_id == annonce.proprietaire_id:
        return

    Notification.objects.create(
        destinataire=annonce.proprietaire,
        annonce=annonce,
        type_notif=Notification.TypeNotif.NOUVEAU_FAVORI,
        titre="Nouveau favori",
        message=f"Quelqu'un a ajouté votre annonce « {annonce.titre} » à ses favoris.",
    )


@receiver(post_save, sender=Conversation)
def notifier_nouvelle_conversation(sender, instance, created, **kwargs):
    """Notifie le propriétaire quand un nouveau fil de discussion est ouvert sur son annonce."""
    if not created:
        return

    annonce = instance.annonce
    if instance.initiateur_id == annonce.proprietaire_id:
        return

    Notification.objects.create(
        destinataire=annonce.proprietaire,
        annonce=annonce,
        type_notif=Notification.TypeNotif.CONTACT_RECU,
        titre="Nouveau contact reçu",
        message=f"{instance.initiateur.prenom} souhaite discuter de votre annonce « {annonce.titre} ».",
    )
