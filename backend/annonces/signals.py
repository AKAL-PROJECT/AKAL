"""
Signaux annonces (2026-08-19) — déclenche les alertes de recherche
sauvegardée (cf. alertes.py) dès qu'une Annonce PASSE en_ligne, quel que
soit le chemin emprunté pour y arriver : AnnonceEcritureSerializer.update()
(publication normale par le propriétaire), AnnonceAdmin.publier_selection
(action groupée admin), ou publier_scrapees_eligibles (commande shell). Un
signal model-level plutôt qu'un hook dans chacun de ces trois points
d'entrée : les trois écrivent `annonce.statut` puis `.save()`, donc
pre_save/post_save est le seul endroit qui les voit tous sans dupliquer la
détection de transition trois fois (et sans risquer d'en oublier un
quatrième demain).

pre_save mémorise le statut AVANT écriture (sinon post_save ne voit plus
que la nouvelle valeur, la comparaison serait toujours vraie) ; post_save
ne déclenche qu'après un COMMIT réel de la transaction englobante
(transaction.on_commit) — sans ça, une notification/email pourrait partir
pour une publication finalement annulée par un rollback plus haut dans la
même transaction (ex. can_publish() invalidé par une autre contrainte
vérifiée après ce save).
"""
from django.db import transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import Annonce


@receiver(pre_save, sender=Annonce)
def _memoriser_statut_avant_sauvegarde(sender, instance, **kwargs):
    if not instance.pk:
        instance._statut_avant_sauvegarde = None
        return
    try:
        instance._statut_avant_sauvegarde = Annonce.objects.only('statut').get(pk=instance.pk).statut
    except Annonce.DoesNotExist:
        instance._statut_avant_sauvegarde = None


@receiver(post_save, sender=Annonce)
def _declencher_alertes_si_nouvellement_en_ligne(sender, instance, created, **kwargs):
    statut_avant = getattr(instance, '_statut_avant_sauvegarde', None)
    deja_en_ligne = statut_avant == Annonce.StatutAnnonce.EN_LIGNE
    if created or deja_en_ligne or instance.statut != Annonce.StatutAnnonce.EN_LIGNE:
        return

    annonce_id = instance.pk

    def _dispatcher():
        # Import différé : évite un cycle (alertes.py importe déjà depuis
        # .models, pas besoin que ce module-ci soit importable dès le
        # chargement de .models lui-même).
        from .alertes import notifier_recherches_correspondantes
        notifier_recherches_correspondantes(annonce_id)

    transaction.on_commit(_dispatcher)
