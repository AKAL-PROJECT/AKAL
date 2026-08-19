"""
Alertes recherche sauvegardée (2026-08-19) — notifie les utilisateurs ayant
enregistré une recherche (RechercheSauvegardee, cf. models.py) dès qu'une
nouvelle annonce EN LIGNE y correspond. Déclenché par signals.py.

Canal in-app (messaging.Notification, déjà existant/déjà exposé par
/api/notifications/) + email (déjà configuré, cf. EMAIL_HOST/
DEFAULT_FROM_EMAIL, akal/settings/base.py) — jamais SMS/WhatsApp : ces deux
canaux nécessiteraient un fournisseur payant à volume réel (Twilio,
WhatsApp Business API...), hors périmètre pour l'instant (décision produit
du 19/08, même constat que pour la modération par IA — cf. échange sur les
approches gratuites/locales).

Matching : réutilise littéralement AnnonceAPIFilter (annonces/api_views.py)
sur une queryset limitée à la seule annonce concernée — jamais une
réimplémentation séparée des règles de filtrage (mêmes critères que la
recherche du catalogue, garantis identiques par construction).
"""
import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def notifier_recherches_correspondantes(annonce_id):
    # Imports différés (pas au niveau module) : évite un cycle avec
    # api_views.py (qui importe .models) et avec messaging (qui importe
    # .models via sa propre FK Notification.annonce).
    from .api_views import AnnonceAPIFilter
    from .models import Annonce, RechercheSauvegardee

    try:
        annonce = Annonce.objects.select_related('parcelle').get(pk=annonce_id)
    except Annonce.DoesNotExist:
        return
    # Re-vérifié ici (pas seulement dans signals.py) : notifier_recherches_correspondantes
    # peut aussi être appelée directement (tests, un futur outil de rattrapage) sans
    # passer par le signal qui garantit déjà cette condition.
    if annonce.statut != Annonce.StatutAnnonce.EN_LIGNE:
        return

    from messaging.models import Notification

    qs_annonce = Annonce.objects.filter(pk=annonce.pk)
    recherches = (
        RechercheSauvegardee.objects.filter(actif=True)
        .exclude(utilisateur_id=annonce.proprietaire_id)  # jamais d'alerte au vendeur pour sa propre annonce
        .select_related('utilisateur')
    )

    for recherche in recherches:
        # AnnonceAPIFilter(data=...) attend le même dict de query params que
        # GET /api/annonces/ — `criteres` est stocké dans ce format exact
        # dès la création de la recherche (cf. api_views.py,
        # RechercheSauvegardeeListCreateAPIView).
        if not AnnonceAPIFilter(data=recherche.criteres, queryset=qs_annonce).qs.exists():
            continue

        Notification.objects.create(
            destinataire=recherche.utilisateur,
            annonce=annonce,
            type_notif=Notification.TypeNotif.ALERTE_RECHERCHE,
            titre=f"Nouvelle annonce pour « {recherche.nom or 'votre recherche sauvegardée'} »",
            message=annonce.titre,
        )

        if recherche.utilisateur.email:
            _envoyer_email_alerte(recherche, annonce)


def _envoyer_email_alerte(recherche, annonce):
    lien = f"{settings.FRONTEND_URL}/parcelles/{annonce.slug}"
    libelle = f" « {recherche.nom} »" if recherche.nom else ""
    try:
        send_mail(
            subject=f"AKAL — Nouvelle annonce : {annonce.titre}",
            message=(
                f"Bonjour,\n\n"
                f"Une nouvelle annonce correspond à votre recherche sauvegardée{libelle} sur AKAL :\n\n"
                f"{annonce.titre}\n"
                f"{lien}\n\n"
                f"— L'équipe AKAL"
            ),
            from_email=None,  # settings.DEFAULT_FROM_EMAIL
            recipient_list=[recherche.utilisateur.email],
            fail_silently=True,
        )
    except Exception:
        # fail_silently=True absorbe déjà les erreurs SMTPException, mais
        # pas un souci de configuration plus en amont (ex. EMAIL_BACKEND mal
        # formé) — filet de sécurité explicite : un email raté ne doit
        # jamais faire échouer la transaction de publication de l'annonce
        # elle-même (déjà commitée à ce stade, cf. signals.py, mais reste
        # dans la même requête HTTP si appelée en synchrone).
        logger.exception("Échec d'envoi de l'email d'alerte recherche sauvegardée (recherche=%s)", recherche.id)
