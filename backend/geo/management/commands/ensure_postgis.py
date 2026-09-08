"""
Management command : ensure_postgis

``CREATE EXTENSION IF NOT EXISTS postgis`` sur la base courante.

Pourquoi c'est nécessaire
-------------------------
GeoDjango exige que l'extension PostGIS soit active AVANT la première
migration qui crée un champ géométrique (``geo.0001``, ``annonces.0001``).

- En local / CI, l'image ``postgis/postgis`` l'active elle-même à
  l'initialisation du conteneur → cette commande est un no-op.
- Sur une base PostgreSQL managée « nue » (Render, RDS, Cloud SQL…),
  l'extension n'est PAS active par défaut et ``migrate`` échoue sur le
  premier ``PointField``. Cette commande comble ce trou : la lancer avant
  ``migrate`` dans la commande de démarrage (cf. backend/Dockerfile).

Idempotente (``IF NOT EXISTS``) et sans risque : rejouable à chaque
déploiement. Nécessite que l'utilisateur de connexion ait le droit de créer
une extension (le cas du compte propriétaire d'une base managée).
"""

from django.core.management.base import BaseCommand
from django.db import connection, ProgrammingError


class Command(BaseCommand):
    help = "Active l'extension PostGIS sur la base si elle ne l'est pas déjà."

    def handle(self, *args, **options):
        with connection.cursor() as cursor:
            try:
                cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
            except ProgrammingError as exc:
                # Droits insuffisants : on le signale clairement plutôt que de
                # laisser `migrate` échouer plus loin avec un message obscur.
                self.stderr.write(self.style.ERROR(
                    "Impossible d'activer PostGIS (droits insuffisants ?). "
                    "Activez-la manuellement une fois : `CREATE EXTENSION postgis;` "
                    f"— détail : {exc}"
                ))
                raise

            cursor.execute("SELECT extversion FROM pg_extension WHERE extname = 'postgis';")
            row = cursor.fetchone()

        version = row[0] if row else "inconnue"
        self.stdout.write(self.style.SUCCESS(f"PostGIS actif (version {version})."))
