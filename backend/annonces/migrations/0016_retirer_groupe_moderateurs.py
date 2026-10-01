# Retire le groupe "Modérateurs" (migration 0009_groupe_moderateurs) au
# profit de "Moderateur" (permissions custom valider_annonce/
# suspendre_annonce/accounts.suspendre_utilisateur, synchronisées par la
# management command init_groupes plutôt que par une migration — cf. son
# docstring) : change_annonce donnait accès à n'importe quel champ de
# l'annonce, alors que seules deux actions précises (valider, suspendre)
# sont réellement nécessaires à un modérateur.
#
# Cette migration ne fait QUE déplacer les membres et créer le groupe cible
# (vide) — elle ne lui attache aucune permission : c'est le rôle
# d'init_groupes, rejouée après chaque `migrate` (docker-entrypoint.sh),
# jamais dupliqué ici.
from django.db import migrations

NOM_GROUPE_RETIRE = "Modérateurs"
NOM_GROUPE_CIBLE = "Moderateur"


def migrer_membres(apps, schema_editor):
    Group = apps.get_model("auth", "Group")

    ancien = Group.objects.filter(name=NOM_GROUPE_RETIRE).first()
    if ancien is None:
        return

    nouveau, _ = Group.objects.get_or_create(name=NOM_GROUPE_CIBLE)
    for user in ancien.user_set.all():
        user.groups.add(nouveau)
    ancien.delete()


def recreer_ancien_groupe(apps, schema_editor):
    # Reverse symétrique de la migration 0009 (mêmes permissions d'origine)
    # — create_permissions() au cas où elles n'existent pas encore sur une
    # base neuve reconstruite en sens inverse (même raison que 0009).
    from django.apps import apps as apps_reels
    from django.contrib.auth.management import create_permissions

    app_config = apps_reels.get_app_config("annonces")
    create_permissions(app_config, apps=apps_reels, verbosity=0, using=schema_editor.connection.alias)

    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")

    nouveau = Group.objects.filter(name=NOM_GROUPE_CIBLE).first()

    ancien, _ = Group.objects.get_or_create(name=NOM_GROUPE_RETIRE)
    permissions = []
    for app_label, codename in [
        ("annonces", "view_annonce"),
        ("annonces", "change_annonce"),
        ("annonces", "view_parcelle"),
        ("annonces", "view_photo"),
    ]:
        try:
            permissions.append(Permission.objects.get(content_type__app_label=app_label, codename=codename))
        except Permission.DoesNotExist:
            continue
    ancien.permissions.set(permissions)

    if nouveau is not None:
        for user in nouveau.user_set.all():
            user.groups.add(ancien)


class Migration(migrations.Migration):

    dependencies = [
        ("annonces", "0015_alter_annonce_options"),
    ]

    operations = [
        migrations.RunPython(migrer_membres, recreer_ancien_groupe),
    ]
