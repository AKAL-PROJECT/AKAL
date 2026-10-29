# pyrefly: ignore [missing-import]
from django.contrib import admin, messages
from django.utils.html import format_html

from .models import Parcelle, Annonce, Photo, DonneesGeo, RechercheSauvegardee, StatistiqueAnnonce, DecisionModeration, Signalement
from . import moderation_actions
from .admin_moderation import appliquer_avec_motif, rapporter


@admin.register(Parcelle)
class ParcelleAdmin(admin.ModelAdmin):
    list_display = ('id', 'commune', 'surface_ha', 'statut_foncier', 'acces_eau', 'created_at')
    list_filter = ('statut_foncier', 'acces_eau', 'topographie', 'acces_routier')
    search_fields = ('commune__nom',)


# Aperçu inline des photos d'une annonce (audit admin du 19/08) — pour
# modérer une annonce (surtout « en attente »), voir ses photos sans
# ouvrir un onglet séparé par photo change concrètement le temps de revue.
# Lecture seule : la gestion des photos (ajout/suppression/ordre) reste le
# flux du dépôt d'annonce côté propriétaire, pas un usage prévu ici.
class PhotoInline(admin.TabularInline):
    model = Photo
    extra = 0
    fields = ('apercu', 'ordre', 'created_at')
    readonly_fields = ('apercu', 'ordre', 'created_at')
    can_delete = False

    @admin.display(description='Aperçu')
    def apercu(self, photo):
        if not photo.image:
            return '—'
        return format_html('<img src="{}" style="max-height:120px;border-radius:4px;" />', photo.image.url)

    def has_add_permission(self, request, obj=None):
        return False


# ── Actions groupées (audit admin du 19/08) ──────────────────────────────
#
# Jusqu'ici, la seule façon de publier une annonce satisfaisant déjà
# can_publish() sans être en_ligne était la commande shell
# publier_scrapees_eligibles (annonces scrapées de test uniquement,
# inutilisable par quelqu'un sans accès serveur) — et `en_attente` était un
# statut du graphe de transitions.py sans aucun déclencheur qui l'exploite
# (« réservé », cf. commentaire de ce module). Ces trois actions permettent
# enfin d'agir dessus depuis l'admin, pour n'importe quelle annonce (pas
# seulement les scrapées) et sans terminal.
#
# Toutes passent par moderation_actions.py (2026-10-29), comme le dashboard
# /moderation : une décision prise ici apparaît au journal. Aucune ne
# touche `annonce.statut` sans repasser par transition_autorisee()
# (le graphe officiel, annonces/transitions.py) — jamais une affectation
# directe qui pourrait forcer une transition interdite (d'où l'absence
# volontaire de `list_editable` sur `statut` : une édition inline en liste
# n'aurait, elle, aucune de ces garanties).
#
# `allowed_permissions` (cf. Django ModelAdmin.get_actions) masque chaque
# action à qui n'a pas la permission custom correspondante — has_*_permission
# ci-dessous sur AnnonceAdmin, appelées par ce mécanisme. Sans ça, Django
# n'exigerait que l'accès à la liste elle-même (view_annonce suffirait) pour
# voir apparaître les trois actions dans le menu déroulant.

@admin.action(description="Publier la sélection (brouillon/en attente → en ligne)")
def publier_selection(modeladmin, request, queryset):
    # Délègue à moderation_actions.valider() — même fonction que le
    # dashboard /moderation (ModerationDecisionAPIView) : transition via
    # Annonce.valider(), ligne au journal, signalements classés, vendeur
    # prévenu. Seul écart : un brouillon peut être publié directement d'ici.
    appliquees, ignorees = 0, []
    for annonce in queryset:
        try:
            moderation_actions.valider(annonce, request.user, depuis_brouillon=True)
            appliquees += 1
        except moderation_actions.DecisionImpossible as exc:
            ignorees.append(f"{annonce} : {exc}")
    rapporter(modeladmin, request, appliquees, ignorees)


publier_selection.allowed_permissions = ('valider_annonce',)


@admin.action(description="Rejeter la sélection « en attente » (retour en brouillon)")
def rejeter_selection(modeladmin, request, queryset):
    # Motif obligatoire (montré au vendeur), demandé par une page
    # intermédiaire — cf. admin_moderation.py.
    return appliquer_avec_motif(
        modeladmin, request, queryset, "Rejeter des annonces",
        lambda annonce, motif, commentaire: moderation_actions.rejeter(annonce, request.user, motif, commentaire),
    )


rejeter_selection.allowed_permissions = ('valider_annonce',)


@admin.action(description="Suspendre la sélection « en ligne » (retour en archivée)")
def suspendre_selection(modeladmin, request, queryset):
    # en_ligne -> archivee à l'initiative d'un modérateur, motif obligatoire
    # (même règle que le dashboard, cf. moderation_actions.suspendre).
    return appliquer_avec_motif(
        modeladmin, request, queryset, "Suspendre des annonces",
        lambda annonce, motif, commentaire: moderation_actions.suspendre(annonce, request.user, motif, commentaire),
    )


suspendre_selection.allowed_permissions = ('suspendre_annonce',)


@admin.register(Annonce)
class AnnonceAdmin(admin.ModelAdmin):
    list_display = ('titre', 'proprietaire', 'prix_mad', 'statut', 'signal_moderation', 'source', 'created_at')
    list_filter = ('statut', 'source')
    search_fields = ('titre', 'slug')
    prepopulated_fields = {'slug': ('titre',)}
    inlines = [PhotoInline]
    actions = [publier_selection, rejeter_selection, suspendre_selection]
    # `motif_moderation` n'est jamais rempli à la main (cf. moderation.py) —
    # lecture seule pour tout le monde, y compris un superutilisateur.
    readonly_fields = ('motif_moderation',)

    def has_valider_annonce_permission(self, request):
        return request.user.has_perm('annonces.valider_annonce')

    def has_suspendre_annonce_permission(self, request):
        return request.user.has_perm('annonces.suspendre_annonce')

    @admin.display(description='Modération')
    def signal_moderation(self, obj):
        # Colonne courte pour repérer d'un coup d'œil, dans la liste, quelles
        # annonces `en_attente` viennent du signal automatique plutôt que
        # d'un futur autre déclencheur — le détail complet (raisons) reste
        # sur la page de l'annonce (motif_moderation, en lecture seule).
        return "⚠ signalée" if obj.motif_moderation else ""

    def get_readonly_fields(self, request, obj=None):
        # `statut` reste modifiable en direct pour un superutilisateur
        # (dépannage). Pour tout le monde d'autre, déjà lecture seule de
        # fait (Django force le formulaire entier en lecture pour qui n'a
        # pas change_annonce, dont le groupe "Moderateur" depuis la
        # migration 0016_retirer_groupe_moderateurs) — explicité ici en
        # filet de sécurité pour un éventuel futur rôle qui aurait
        # change_annonce sans être superutilisateur : rien n'empêcherait
        # alors une édition du formulaire de forcer une transition interdite
        # par transitions.py (ex. vendue → brouillon) en contournant
        # entièrement publier_selection/rejeter_selection/suspendre_selection
        # ci-dessus.
        if request.user.is_superuser:
            return super().get_readonly_fields(request, obj)
        return super().get_readonly_fields(request, obj) + ('statut',)


@admin.register(Photo)
class PhotoAdmin(admin.ModelAdmin):
    list_display = ('annonce', 'ordre', 'created_at')


@admin.register(DonneesGeo)
class DonneesGeoAdmin(admin.ModelAdmin):
    list_display = ('parcelle',)
    search_fields = ('parcelle__id',)


@admin.register(StatistiqueAnnonce)
class StatistiqueAnnonceAdmin(admin.ModelAdmin):
    list_display = ('annonce', 'date', 'vues')
    list_filter = ('date',)
    search_fields = ('annonce__titre',)


@admin.register(RechercheSauvegardee)
class RechercheSauvegardeeAdmin(admin.ModelAdmin):
    list_display = ('nom', 'utilisateur', 'actif', 'created_at')
    list_filter = ('actif',)
    search_fields = ('nom', 'utilisateur__email')


@admin.register(Signalement)
class SignalementAdmin(admin.ModelAdmin):
    list_display = ('annonce', 'raison', 'statut', 'auteur', 'created_at')
    list_filter = ('statut', 'raison')
    search_fields = ('annonce__titre', 'auteur__email', 'commentaire')
    raw_id_fields = ('annonce', 'auteur')


@admin.register(DecisionModeration)
class DecisionModerationAdmin(admin.ModelAdmin):
    """Journal en lecture seule : une décision ne se réécrit pas, elle se
    corrige par une nouvelle décision (cf. annonces/moderation_actions.py)."""

    list_display = ('created_at', 'action', 'titre_annonce', 'utilisateur_cible', 'moderateur', 'motif')
    list_filter = ('action', 'motif')
    search_fields = ('titre_annonce', 'commentaire', 'utilisateur_cible__email', 'moderateur__email')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
