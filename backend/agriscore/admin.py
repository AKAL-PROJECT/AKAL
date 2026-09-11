from django.contrib import admin

from .models import ConfigurationAgriScore, StatistiquePasseport


@admin.register(ConfigurationAgriScore)
class ConfigurationAgriScoreAdmin(admin.ModelAdmin):
    """Singleton : une seule ligne, ni ajout ni suppression depuis l'admin."""

    list_display = ('__str__', 'actif', 'modifie_le')
    readonly_fields = ('modifie_le',)
    fieldsets = (
        (None, {'fields': ('actif',)}),
        (
            'Pondérations (doit sommer à 100)',
            {
                'fields': ('poids_ndvi', 'poids_climat', 'poids_sol', 'poids_topo', 'poids_acces'),
                'description': (
                    "Poids /100 de chaque dimension dans le score global. La somme "
                    "des cinq doit faire 100 — un enregistrement hors de cette "
                    "contrainte est refusé (message d'erreur affiché ci-dessus)."
                ),
            },
        ),
        ('Métadonnées', {'fields': ('modifie_le',)}),
    )

    def has_add_permission(self, request):
        return not ConfigurationAgriScore.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        # Toujours une ligne : on la crée au premier accès à l'admin.
        ConfigurationAgriScore.charger()
        return super().changelist_view(request, extra_context)


@admin.register(StatistiquePasseport)
class StatistiquePasseportAdmin(admin.ModelAdmin):
    """Lecture seule — alimenté uniquement par PasseportParcelleAPIView."""

    list_display = ('date', 'compteur')
    ordering = ('-date',)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
