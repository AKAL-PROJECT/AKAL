# pyrefly: ignore [missing-import]
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from annonces import moderation_actions
from annonces.admin_moderation import appliquer_avec_motif

from .models import User


# Action groupée (2026-09-29) — jusqu'ici, suspendre un compte n'était
# possible qu'en cochant `is_active` à la main sur la fiche utilisateur,
# ce qui suppose déjà `change_user` (donc l'accès à tous les autres champs
# du compte, y compris is_staff/is_superuser). `suspendre_annonce` a son
# équivalent côté annonces (annonces/admin.py::suspendre_selection) ;
# `suspendre_utilisateur` fait de même ici, sans rien donner d'autre que ça.
@admin.action(description="Suspendre les comptes sélectionnés (is_active = False)")
def suspendre_selection(modeladmin, request, queryset):
    # Délègue à annonces/moderation_actions.suspendre_compte() (2026-10-29),
    # comme le dashboard /moderation : motif obligatoire, ligne au journal.
    # Mêmes garde-fous : jamais un membre de l'équipe (staff/superutilisateur)
    # ni le compte de la personne qui déclenche l'action (on ne se suspend
    # pas soi-même, on se déconnecte).
    return appliquer_avec_motif(
        modeladmin, request, queryset, "Suspendre des comptes",
        lambda utilisateur, motif, commentaire: moderation_actions.suspendre_compte(
            utilisateur, request.user, motif, commentaire,
        ),
    )


suspendre_selection.allowed_permissions = ('suspendre_utilisateur',)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('email', 'nom', 'prenom', 'role', 'is_active', 'is_verified', 'date_inscription')
    list_filter = ('role', 'is_active', 'is_verified')
    search_fields = ('email', 'nom', 'prenom')
    ordering = ('-date_inscription',)
    actions = [suspendre_selection]

    def has_suspendre_utilisateur_permission(self, request):
        return request.user.has_perm('accounts.suspendre_utilisateur')

    # Adapter les fieldsets car on n'utilise plus username
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Informations personnelles', {'fields': ('nom', 'prenom', 'telephone', 'avatar')}),
        ('Rôle & Vérification', {'fields': ('role', 'is_verified')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'nom', 'prenom', 'role', 'password1', 'password2'),
        }),
    )
