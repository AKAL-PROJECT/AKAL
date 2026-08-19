from django.apps import AppConfig


class AnnoncesConfig(AppConfig):
    name = 'annonces'

    def ready(self):
        # Enregistre les récepteurs de signals.py (alertes recherche
        # sauvegardée, 2026-08-19) — sans cet import, les décorateurs
        # @receiver du module ne s'exécutent jamais (Django ne découvre pas
        # signals.py tout seul, contrairement à models.py/admin.py).
        from . import signals  # noqa: F401
