from django.contrib import admin

from .models import ConfigurationAgriScore, StatistiquePasseport


@admin.register(ConfigurationAgriScore)
class ConfigurationAgriScoreAdmin(admin.ModelAdmin):
    """Singleton : une seule ligne, ni ajout ni suppression depuis l'admin."""

    list_display = ('__str__', 'actif', 'modifie_le')
    readonly_fields = ('modifie_le',)

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
