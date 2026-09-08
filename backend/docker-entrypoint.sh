#!/usr/bin/env sh
# Entrypoint du conteneur backend — prépare la base puis lance la commande
# passée en argument (gunicorn en prod, runserver en docker-compose local).
#
# Idempotent : rejouable à chaque démarrage/redéploiement.
set -e

echo "→ collectstatic"
python manage.py collectstatic --noinput

echo "→ ensure_postgis"
python manage.py ensure_postgis

echo "→ migrate"
python manage.py migrate --noinput

# SEED_ON_START=1 (docker-compose full-stack uniquement) : charge le
# référentiel géo officiel + un petit catalogue de démonstration, une seule
# fois (seed_demo est sauté si des annonces de démo existent déjà).
if [ "${SEED_ON_START:-0}" = "1" ]; then
  echo "→ import_geo_officiel"
  python manage.py import_geo_officiel || echo "  (import_geo_officiel a échoué — shapefiles manquants ? on continue)"

  SEED_COUNT=$(python manage.py shell -c "from annonces.models import Annonce; print(Annonce.objects.filter(proprietaire__email__endswith='@akal.ma', source='interne').count())" 2>/dev/null | tail -n 1)
  if [ "${SEED_COUNT:-0}" -gt 0 ] 2>/dev/null; then
    echo "  seed_demo déjà présent (${SEED_COUNT} annonces) — sauté"
  else
    echo "→ seed_demo"
    python manage.py seed_demo
  fi
fi

echo "→ démarrage : $*"
exec "$@"
