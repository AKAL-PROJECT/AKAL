"""
Management command : init_groupes

Crée (ou met à jour) le groupe Django "Moderateur", seul rôle de modération
du projet — il remplace "Modérateurs" (migration 0009_groupe_moderateurs,
retiré par 0016_retirer_groupe_moderateurs) plutôt que de s'y ajouter, pour
que la review de contenu (annonces) et la gestion des comptes (suspension)
passent par des permissions distinctes et précises (valider_annonce,
suspendre_annonce, accounts.suspendre_utilisateur) plutôt que par
change_annonce/change_user, qui autoriseraient aussi la modification de
n'importe quel autre champ. view_annonce/view_parcelle/view_photo et
accounts.view_user complètent la liste : sans eux, le groupe n'aurait même
pas accès aux listes /admin/ correspondantes (cf. annonces/admin.py et
accounts/admin.py — Django exige au moins view ou change pour ouvrir la
liste d'un modèle dans l'admin).

Idempotent : rejouable sans effet de bord (get_or_create + set()), à
appeler après chaque `migrate` (script de déploiement ou CI) pour que le
groupe existe sur tout environnement sans intervention manuelle. Contrairement
à la data migration 0009, pas besoin d'appeler create_permissions() ici : une
management command s'exécute après que `migrate` a fini, donc après le signal
post_migrate qui crée déjà les permissions custom des modèles.

Échoue volontairement (CommandError, code de sortie non nul) si une
permission de PERMISSIONS est introuvable, plutôt que de créer un groupe
incomplet en silence — sinon une permission renommée dans un Meta.permissions
sans mise à jour de cette liste passerait inaperçue jusqu'à ce qu'un
modérateur en prod découvre qu'il ne peut plus valider d'annonce.

Usage:
    python manage.py init_groupes
"""

from django.contrib.auth.models import Group, Permission
from django.core.management.base import BaseCommand, CommandError

NOM_GROUPE = "Moderateur"

# (app_label, codename) — étendre cette liste au fil des futurs rôles
# (ex. Support une fois Ticket/DocumentJuridique créés) plutôt que
# d'ajouter une deuxième commande.
PERMISSIONS = [
    ("annonces", "view_annonce"),
    ("annonces", "view_parcelle"),
    ("annonces", "view_photo"),
    ("annonces", "valider_annonce"),
    ("annonces", "suspendre_annonce"),
    ("accounts", "view_user"),
    ("accounts", "suspendre_utilisateur"),
]


class Command(BaseCommand):
    help = 'Crée/synchronise le groupe "Moderateur" avec ses permissions custom.'

    def handle(self, *args, **options):
        permissions = []
        manquantes = []
        for app_label, codename in PERMISSIONS:
            try:
                permissions.append(
                    Permission.objects.get(content_type__app_label=app_label, codename=codename)
                )
            except Permission.DoesNotExist:
                manquantes.append(f"{app_label}.{codename}")

        if manquantes:
            raise CommandError(
                "Permission(s) introuvable(s) — migrate n'a peut-être pas encore tourné, ou une "
                "permission a été renommée dans un Meta.permissions sans mettre à jour PERMISSIONS "
                "ci-dessus : " + ", ".join(manquantes)
            )

        groupe, cree = Group.objects.get_or_create(name=NOM_GROUPE)
        groupe.permissions.set(permissions)

        self.stdout.write(self.style.SUCCESS(
            f"{'Créé' if cree else 'Mis à jour'} : groupe \"{NOM_GROUPE}\" "
            f"({len(permissions)} permission(s))."
        ))
