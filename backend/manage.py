#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""

    # Repli vers dev volontairement conservé ICI (contrairement à
    # akal/wsgi.py et akal/asgi.py, cf. audit go-live du 2026-08-10) : ce
    # fichier est un outil de développeur (runserver, test, makemigrations,
    # shell...), jamais le point d'entrée qui sert du trafic réel — le
    # repli silencieux qui posait un risque en production (DEBUG=True,
    # CORS grand ouvert) est sans danger ici. Le retirer forcerait un export
    # manuel de DJANGO_SETTINGS_MODULE avant chaque commande locale, sans
    # bénéfice de sécurité en contrepartie.
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'akal.settings.dev')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
