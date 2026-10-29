"""
Décisions humaines de modération (dashboard /moderation).

Point d'entrée unique pour valider, rejeter, suspendre une annonce, classer
ses signalements et suspendre / réactiver un compte : chaque décision
  1. applique la transition (via Annonce.valider()/rejeter() ou le graphe
     de transitions.py — jamais une affectation de statut ad hoc) ;
  2. écrit une ligne dans le journal (DecisionModeration) ;
  3. clôt les signalements ouverts de l'annonce le cas échéant ;
  4. prévient le vendeur (notification in-app + email, après commit).

Toutes les fonctions lèvent DecisionImpossible (message lisible) plutôt
que de renvoyer un booléen : la vue la traduit en 400.
"""

import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from accounts.models import DOMAINE_EMAIL_TELEPHONE

from .models import Annonce, DecisionModeration, Signalement
from .transitions import transition_autorisee

logger = logging.getLogger(__name__)


class DecisionImpossible(Exception):
    pass


# Motifs proposés au modérateur pour un rejet ou une suspension — codes
# stables (journal, statistiques), libellés montrés au vendeur.
MOTIFS = {
    'photos_non_conformes': "Les photos ne montrent pas clairement le terrain.",
    'informations_incompletes': "Des informations essentielles manquent ou sont imprécises.",
    'prix_incoherent': "Le prix paraît incohérent avec la surface ou la localisation.",
    'hors_sujet': "L'annonce ne concerne pas un terrain agricole.",
    'coordonnees_dans_le_texte': "Le texte contient des coordonnées ou liens externes : utilisez la messagerie AKAL.",
    'doublon': "Cette annonce fait doublon avec une autre annonce.",
    'arnaque_suspectee': "L'annonce présente des signes de fraude.",
    'autre': "",
}


def _motif_pour_vendeur(motif, commentaire):
    libelle = MOTIFS.get(motif, '')
    commentaire = (commentaire or '').strip()
    if libelle and commentaire:
        return f"{libelle} {commentaire}"
    return libelle or commentaire


def valider_motif(motif, commentaire):
    """Motif obligatoire pour un rejet / une suspension ; « autre » exige
    un commentaire (sinon le vendeur ne saurait pas quoi corriger)."""
    if motif not in MOTIFS:
        raise DecisionImpossible("Choisissez un motif.")
    if motif == 'autre' and not (commentaire or '').strip():
        raise DecisionImpossible("Précisez le motif dans le commentaire.")


def _journaliser(action, moderateur, annonce=None, utilisateur=None, motif='', commentaire=''):
    return DecisionModeration.objects.create(
        action=action,
        moderateur=moderateur,
        annonce=annonce,
        utilisateur_cible=utilisateur or (annonce.proprietaire if annonce else None),
        titre_annonce=annonce.titre if annonce else '',
        motif=motif,
        commentaire=(commentaire or '').strip(),
    )


def _clore_signalements(annonce, statut):
    return annonce.signalements.filter(statut=Signalement.Statut.OUVERT).update(
        statut=statut, traite_le=timezone.now(),
    )


def _email_exploitable(email):
    return bool(email) and not email.lower().endswith(f'@{DOMAINE_EMAIL_TELEPHONE}')


def _notifier_vendeur(annonce, type_notif, titre, message):
    from messaging.models import Notification  # import différé : évite un cycle messaging -> annonces

    Notification.objects.create(
        destinataire=annonce.proprietaire, annonce=annonce,
        type_notif=type_notif, titre=titre, message=message,
    )
    email = annonce.proprietaire.email
    if not _email_exploitable(email):
        return
    lien = f"{settings.FRONTEND_URL}/compte/annonces"

    def _envoyer():
        try:
            send_mail(
                subject=f"AKAL — {titre}",
                message=f"Bonjour {annonce.proprietaire.prenom},\n\n{message}\n\nVos annonces : {lien}\n\nL'équipe AKAL",
                from_email=None,
                recipient_list=[email],
                fail_silently=True,
            )
        except Exception:  # noqa: BLE001 — un email raté ne défait jamais une décision
            logger.warning("Email de décision de modération non envoyé", exc_info=True)

    transaction.on_commit(_envoyer)


@transaction.atomic
def valider(annonce, moderateur, commentaire=''):
    if annonce.statut != Annonce.StatutAnnonce.EN_ATTENTE:
        raise DecisionImpossible("Seule une annonce en attente peut être validée.")
    ok, raisons = annonce.valider()
    if not ok:
        raise DecisionImpossible(" ".join(raisons) or "Transition refusée.")
    _journaliser(DecisionModeration.Action.VALIDATION, moderateur, annonce, commentaire=commentaire)
    _clore_signalements(annonce, Signalement.Statut.CLASSE)
    from messaging.models import Notification
    _notifier_vendeur(
        annonce, Notification.TypeNotif.ANNONCE_VALIDEE,
        "Votre annonce est en ligne",
        f"Votre annonce « {annonce.titre} » a été validée et est désormais visible dans le catalogue.",
    )
    return annonce


@transaction.atomic
def rejeter(annonce, moderateur, motif, commentaire=''):
    if annonce.statut != Annonce.StatutAnnonce.EN_ATTENTE:
        raise DecisionImpossible("Seule une annonce en attente peut être rejetée.")
    valider_motif(motif, commentaire)
    if not annonce.rejeter():
        raise DecisionImpossible("Transition refusée.")
    annonce.motif_rejet = _motif_pour_vendeur(motif, commentaire)
    annonce.save(update_fields=['motif_rejet'])
    _journaliser(DecisionModeration.Action.REJET, moderateur, annonce, motif=motif, commentaire=commentaire)
    _clore_signalements(annonce, Signalement.Statut.TRAITE)
    from messaging.models import Notification
    _notifier_vendeur(
        annonce, Notification.TypeNotif.ANNONCE_REJETEE,
        "Votre annonce doit être corrigée",
        f"Votre annonce « {annonce.titre} » n'a pas été publiée. Motif : {annonce.motif_rejet} "
        "Corrigez-la depuis « Mes annonces » puis republiez-la.",
    )
    return annonce


@transaction.atomic
def suspendre(annonce, moderateur, motif, commentaire=''):
    """Retire une annonce EN LIGNE du catalogue (en_ligne -> archivee). Le
    motif est aussi posé dans motif_moderation : si le vendeur tente de la
    réactiver, elle repasse en file d'attente au lieu de revenir en ligne
    (cf. AnnonceEcritureSerializer.update, réactivation)."""
    if not (annonce.statut == Annonce.StatutAnnonce.EN_LIGNE
            and transition_autorisee(annonce.statut, Annonce.StatutAnnonce.ARCHIVEE)):
        raise DecisionImpossible("Seule une annonce en ligne peut être suspendue.")
    valider_motif(motif, commentaire)
    annonce.statut = Annonce.StatutAnnonce.ARCHIVEE
    annonce.motif_rejet = _motif_pour_vendeur(motif, commentaire)
    annonce.motif_moderation = f"Suspendue par la modération : {annonce.motif_rejet}"
    annonce.save(update_fields=['statut', 'motif_rejet', 'motif_moderation'])
    _journaliser(DecisionModeration.Action.SUSPENSION, moderateur, annonce, motif=motif, commentaire=commentaire)
    _clore_signalements(annonce, Signalement.Statut.TRAITE)
    from messaging.models import Notification
    _notifier_vendeur(
        annonce, Notification.TypeNotif.ANNONCE_SUSPENDUE,
        "Votre annonce a été suspendue",
        f"Votre annonce « {annonce.titre} » a été retirée du catalogue. Motif : {annonce.motif_rejet} "
        "Après correction, sa remise en ligne sera revue par un modérateur.",
    )
    return annonce


@transaction.atomic
def classer_signalements(annonce, moderateur, commentaire=''):
    """Signalements jugés infondés : l'annonce reste en ligne."""
    if not _clore_signalements(annonce, Signalement.Statut.CLASSE):
        raise DecisionImpossible("Aucun signalement ouvert sur cette annonce.")
    _journaliser(DecisionModeration.Action.CLASSEMENT, moderateur, annonce, commentaire=commentaire)
    return annonce


def _verifier_cible_compte(utilisateur, moderateur):
    # Mêmes garde-fous que l'action admin accounts/admin.py::suspendre_selection,
    # plus : jamais un membre du staff (un modérateur ne suspend pas un pair).
    if utilisateur.pk == moderateur.pk:
        raise DecisionImpossible("Vous ne pouvez pas suspendre votre propre compte.")
    if utilisateur.is_superuser or utilisateur.is_staff:
        raise DecisionImpossible("Un compte de l'équipe ne peut pas être suspendu ici.")


@transaction.atomic
def suspendre_compte(utilisateur, moderateur, motif, commentaire=''):
    _verifier_cible_compte(utilisateur, moderateur)
    valider_motif(motif, commentaire)
    if not utilisateur.is_active:
        raise DecisionImpossible("Ce compte est déjà suspendu.")
    utilisateur.is_active = False
    utilisateur.save(update_fields=['is_active'])
    _journaliser(DecisionModeration.Action.SUSPENSION_COMPTE, moderateur, utilisateur=utilisateur,
                 motif=motif, commentaire=commentaire)
    return utilisateur


@transaction.atomic
def reactiver_compte(utilisateur, moderateur, commentaire=''):
    _verifier_cible_compte(utilisateur, moderateur)
    if utilisateur.is_active:
        raise DecisionImpossible("Ce compte est déjà actif.")
    utilisateur.is_active = True
    utilisateur.save(update_fields=['is_active'])
    _journaliser(DecisionModeration.Action.REACTIVATION_COMPTE, moderateur, utilisateur=utilisateur,
                 commentaire=commentaire)
    return utilisateur
