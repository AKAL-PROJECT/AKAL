# pyrefly: ignore [missing-import]
from django.apps import AppConfig


class MessagingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'messaging'
    verbose_name = 'Messagerie'

    def ready(self):
        import messaging.signals  # noqa: F401
