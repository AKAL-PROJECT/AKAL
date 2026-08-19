# Groupe Django "Modérateurs" (audit admin du 19/08) — périmètre volontairement
# restreint : review de contenu (Annonce), jamais la gestion des comptes
# (accounts.User), de la messagerie ou du référentiel géo. Un utilisateur
# ajouté à ce groupe doit AUSSI avoir `is_staff=True` (attribut du modèle
# User, hors de portée d'un Group Django) pour pouvoir se connecter à
# /admin/ — les deux réglages sont indépendants, faits séparément à la main
# depuis la fiche utilisateur (admin ou shell), aucune migration ne peut le
# faire à la place d'un choix humain sur QUI devient modérateur.
#
# Permissions accordées : voir + changer une Annonce (change_annonce est
# nécessaire pour que les actions groupées publier_selection/
# rejeter_selection apparaissent — Django masque les actions "écriture"
# aux utilisateurs sans la permission "change" sur le modèle ciblé),
# voir une Parcelle/Photo (contexte de la revue), jamais ajouter/supprimer
# quoi que ce soit ni toucher aux autres modèles.
from django.apps import apps as apps_reels
from django.contrib.auth.management import create_permissions
from django.db import migrations


NOM_GROUPE = "Modérateurs"

# (app_label, codename) — pas de add_/delete_ : un modérateur review du
# contenu existant, il n'en crée ni n'en supprime.
PERMISSIONS = [
    ("annonces", "view_annonce"),
    ("annonces", "change_annonce"),
    ("annonces", "view_parcelle"),
    ("annonces", "view_photo"),
]


def creer_groupe(apps, schema_editor):
    # Les Permission (view_annonce, change_annonce…) sont normalement créées
    # par le signal post_migrate, qui ne se déclenche qu'une fois TOUTES les
    # migrations de la commande `migrate` en cours appliquées — trop tard
    # pour cette RunPython sur une base neuve (ex. base de test reconstruite
    # de zéro à chaque run, cf. annonces/tests.py::AdminModerationTests) :
    # les permissions du modèle Annonce n'existent pas encore au moment où
    # ce code s'exécute, et le try/except DoesNotExist plus bas les aurait
    # silencieusement ignorées (constaté : groupe créé mais 0 permission
    # attachée en base de test). create_permissions() les crée nous-mêmes
    # explicitement d'abord, avec le VRAI registre d'apps (apps_reels, pas
    # `apps` — l'état figé passé par RunPython n'a pas cette fonction) : sur
    # une base où elles existent déjà (ex. dev, migration déjà appliquée
    # avant), create_permissions() ne fait rien (get_or_create en interne).
    app_config = apps_reels.get_app_config("annonces")
    create_permissions(app_config, apps=apps_reels, verbosity=0, using=schema_editor.connection.alias)

    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")

    groupe, _ = Group.objects.get_or_create(name=NOM_GROUPE)
    permissions = []
    for app_label, codename in PERMISSIONS:
        try:
            permissions.append(Permission.objects.get(content_type__app_label=app_label, codename=codename))
        except Permission.DoesNotExist:
            # Filet de sécurité résiduel — ne devrait plus jamais se
            # déclencher grâce à create_permissions() ci-dessus, gardé pour
            # ne pas faire échouer `migrate` sur un état de base vraiment
            # inhabituel (ex. content type supprimé à la main).
            continue
    groupe.permissions.set(permissions)


def supprimer_groupe(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name=NOM_GROUPE).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("annonces", "0008_annonce_source_tracking_parcelle_qualite_nullable"),
        ("auth", "0012_alter_user_first_name_max_length"),
        # create_permissions() a besoin des ContentType des modèles de cette
        # app — sans cette dépendance explicite, rien ne garantit que
        # contenttypes soit déjà migrée avant que cette RunPython s'exécute.
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(creer_groupe, supprimer_groupe),
    ]
