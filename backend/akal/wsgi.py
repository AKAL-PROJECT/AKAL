"""
WSGI config for akal project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

# Audit go-live du 2026-08-10 — PAS de repli silencieux vers dev ici,
# contrairement à manage.py (gardé permissif pour le confort en local) : ce
# fichier est le point d'entrée réel de la production (gunicorn), jamais un
# outil de développeur. Un oubli de variable d'env sur un futur déploiement
# doit planter fort et clair ici plutôt que de servir du trafic réel avec
# DEBUG=True, ALLOWED_HOSTS=['localhost'] et CORS grand ouvert (cf.
# akal.settings.dev) — render.yaml définit déjà explicitement cette variable
# pour le déploiement actuel ; ce garde-fou couvre les suivants.
if 'DJANGO_SETTINGS_MODULE' not in os.environ:
    raise RuntimeError(
        "DJANGO_SETTINGS_MODULE n'est pas défini. En production, la définir "
        "explicitement à 'akal.settings.prod' — jamais de repli implicite "
        "vers dev depuis ce fichier (cf. commentaire ci-dessus)."
    )

application = get_wsgi_application()
