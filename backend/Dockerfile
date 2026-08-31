# Base image optimisée (slim) pour Python.
#
# 2026-08-30 (hardening pré-soutenance) : aligné sur 3.13 — la CI
# (.github/workflows/ci.yml) et l'environnement de dev local tournent tous
# deux sur 3.13, et un ancien venv `akal_env.broken-py314-backup` signale
# que 3.14 a déjà posé problème sur ce projet. Builder l'image de prod sur
# une version que la CI ne valide jamais, c'est un « CI verte mais deploy
# cassé » en puissance. psycopg2/GDAL/Django 6.0 sont tous OK en 3.13.
FROM python:3.13-slim

# Empêche Python d'écrire des fichiers .pyc (gain de place)
ENV PYTHONDONTWRITEBYTECODE=1
# Force Python à écrire directement sur stdout/stderr (pratique pour les logs Docker)
ENV PYTHONUNBUFFERED=1

# Définition du répertoire de travail
WORKDIR /app

# Installation des dépendances système requises pour PostGIS et GeoDjango
# binutils, libproj-dev, gdal-bin, python3-gdal
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        binutils \
        libproj-dev \
        gdal-bin \
        python3-gdal \
        gcc \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copie des fichiers de dépendances en premier pour profiter du cache Docker
COPY requirements.txt /app/
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

# Copie du reste du code source
COPY . /app/

# Collecte des fichiers statiques pour WhiteNoise
# RUN python manage.py collectstatic --noinput (Souvent géré par la plateforme IaC via la start command, 
# mais peut être fait ici si les variables d'environnement nécessaires sont dispo au build)

# Sécurité : Création d'un utilisateur non-root pour exécuter l'application
RUN useradd -m akaluser && chown -R akaluser:akaluser /app
USER akaluser

# Exposition du port (Gunicorn par défaut 8000)
EXPOSE 8000

# Commande par défaut (peut être surchargée par l'IaC comme render.yaml)
#
# --workers : sans ce réglage, gunicorn démarre avec 1 seul worker sync
# (défaut) — une requête lente (upload photo, envoi d'email synchrone dans
# PasswordResetRequestView) bloque alors TOUTES les autres requêtes le temps
# de son exécution. WEB_CONCURRENCY (surchargeable par variable d'env, sans
# toucher à l'image) avec un repli à 3 — point de départ raisonnable pour un
# plan Render modeste, à ajuster avec de la vraie donnée de charge (audit
# go-live du 2026-08-10, cf. formule usuelle (2 x cœurs) + 1).
# --threads : 2 threads par worker, pour absorber un peu de concurrence
# I/O (attente DB/S3/Redis) sans multiplier les workers (donc la mémoire).
# --timeout : 60s (le défaut gunicorn est 30s) — laisse la marge pour un
# upload multi-photos légitime sur une connexion lente, sans laisser un
# worker bloqué indéfiniment sur une requête réellement figée.
CMD sh -c "python manage.py collectstatic --noinput && python manage.py migrate && gunicorn akal.wsgi:application --bind 0.0.0.0:8000 --workers ${WEB_CONCURRENCY:-3} --threads 2 --timeout 60"
