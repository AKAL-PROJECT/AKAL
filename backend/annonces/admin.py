# pyrefly: ignore [missing-import]
from django.contrib import admin, messages
from django.utils import timezone
from django.utils.html import format_html

from .models import Parcelle, Annonce, AgriScore, Photo, DonneesGeo, RechercheSauvegardee, StatistiqueAnnonce
from .transitions import transition_autorisee


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
# (« réservé », cf. commentaire de ce module). Ces deux actions permettent
# enfin d'agir dessus depuis l'admin, pour n'importe quelle annonce (pas
# seulement les scrapées) et sans terminal.
#
# Aucune des deux ne touche `annonce.statut` sans repasser par
# transition_autorisee() (le graphe officiel, annonces/transitions.py) —
# jamais une affectation directe qui pourrait forcer une transition
# interdite (d'où l'absence volontaire de `list_editable` sur `statut` :
# une édition inline en liste n'aurait, elle, aucune de ces garanties).

@admin.action(description="Publier la sélection (brouillon/en attente → en ligne)")
def publier_selection(modeladmin, request, queryset):
    publiees, ignorees = 0, 0
    for annonce in queryset:
        peut_publier, _raisons = annonce.can_publish()
        if not peut_publier or not transition_autorisee(annonce.statut, Annonce.StatutAnnonce.EN_LIGNE):
            ignorees += 1
            continue
        annonce.statut = Annonce.StatutAnnonce.EN_LIGNE
        annonce.date_publication = timezone.now()
        annonce.save(update_fields=['statut', 'date_publication'])
        publiees += 1

    if publiees:
        modeladmin.message_user(request, f"{publiees} annonce(s) publiée(s).", messages.SUCCESS)
    if ignorees:
        modeladmin.message_user(
            request,
            f"{ignorees} annonce(s) ignorée(s) — prérequis de publication non "
            "remplis (localisation, photo, prix) ou statut de départ ne permettant "
            "pas cette transition (ex. déjà en ligne, archivée…).",
            messages.WARNING,
        )


@admin.action(description="Rejeter la sélection « en attente » (retour en brouillon)")
def rejeter_selection(modeladmin, request, queryset):
    rejetees, ignorees = 0, 0
    for annonce in queryset:
        if not transition_autorisee(annonce.statut, Annonce.StatutAnnonce.BROUILLON):
            ignorees += 1
            continue
        annonce.statut = Annonce.StatutAnnonce.BROUILLON
        annonce.save(update_fields=['statut'])
        rejetees += 1

    if rejetees:
        modeladmin.message_user(request, f"{rejetees} annonce(s) repassée(s) en brouillon.", messages.SUCCESS)
    if ignorees:
        modeladmin.message_user(
            request,
            f"{ignorees} annonce(s) ignorée(s) — seule une annonce « en attente » "
            "peut être rejetée (retour en brouillon).",
            messages.WARNING,
        )


@admin.register(Annonce)
class AnnonceAdmin(admin.ModelAdmin):
    list_display = ('titre', 'proprietaire', 'prix_mad', 'statut', 'source', 'created_at')
    list_filter = ('statut', 'source')
    search_fields = ('titre', 'slug')
    prepopulated_fields = {'slug': ('titre',)}
    inlines = [PhotoInline]
    actions = [publier_selection, rejeter_selection]

    def get_readonly_fields(self, request, obj=None):
        # `statut` reste modifiable en direct pour un superutilisateur
        # (dépannage), mais lecture seule pour le groupe Modérateurs (cf.
        # migration 0009_groupe_moderateurs) — sinon rien n'empêche une
        # édition du formulaire de forcer une transition interdite par
        # transitions.py (ex. vendue → brouillon) en contournant
        # entièrement publier_selection/rejeter_selection ci-dessus.
        if request.user.is_superuser:
            return super().get_readonly_fields(request, obj)
        return super().get_readonly_fields(request, obj) + ('statut',)


@admin.register(AgriScore)
class AgriScoreAdmin(admin.ModelAdmin):
    list_display = ('parcelle', 'score_global', 'indice_confiance', 'version_ponderation', 'calculated_at')
    list_filter = ('version_ponderation',)


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
