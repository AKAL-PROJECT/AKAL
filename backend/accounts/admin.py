# pyrefly: ignore [missing-import]
from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


# Action groupée (2026-09-29) — jusqu'ici, suspendre un compte n'était
# possible qu'en cochant `is_active` à la main sur la fiche utilisateur,
# ce qui suppose déjà `change_user` (donc l'accès à tous les autres champs
# du compte, y compris is_staff/is_superuser). `suspendre_annonce` a son
# équivalent côté annonces (annonces/admin.py::suspendre_selection) ;
# `suspendre_utilisateur` fait de même ici, sans rien donner d'autre que ça.
@admin.action(description="Suspendre les comptes sélectionnés (is_active = False)")
def suspendre_selection(modeladmin, request, queryset):
    # Jamais un superutilisateur — même par sélection multiple accidentelle
    # incluant un admin — ni le compte de la personne qui déclenche l'action
    # (on ne se suspend pas soi-même, on se déconnecte).
    cible = queryset.filter(is_superuser=False).exclude(pk=request.user.pk)
    ignorees = queryset.count() - cible.count()
    suspendues = cible.update(is_active=False)

    if suspendues:
        modeladmin.message_user(request, f"{suspendues} compte(s) suspendu(s).", messages.SUCCESS)
    if ignorees:
        modeladmin.message_user(
            request,
            f"{ignorees} compte(s) ignoré(s) — superutilisateur ou votre propre compte.",
            messages.WARNING,
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
