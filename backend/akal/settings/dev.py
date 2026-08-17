import sys

from .base import *

DEBUG = True
ALLOWED_HOSTS = ['localhost', '127.0.0.1']

# AKAL_DATASET (cf. base.py, annonces/managers.py::dataset_actif()) :
# 'simulated' par dÃ©faut partout (prod incluse) â€” ici on bascule le dÃ©faut
# LOCAL sur 'scraped' pour que le catalogue public affiche les annonces
# importÃ©es (import_scraped_data) sans que chacun ait Ã  exporter la
# variable d'env soi-mÃªme (source du "je ne vois pas les donnÃ©es scrapÃ©es"
# constatÃ© en Ã©quipe â€” le serveur d'un poste avait la variable exportÃ©e
# manuellement dans son shell, jamais committÃ©e). Reste surchargeable via
# .env/variable d'env si besoin ponctuel de revenir sur 'simulated' en local.
#
# `if 'test' not in sys.argv` : ce mÃªme settings.dev sert aussi Ã 
# `manage.py test` (en local ET en CI, cf. .github/workflows/ci.yml). La
# suite de tests (annonces/tests.py, PublicationTests notamment) crÃ©e ses
# propres annonces source='interne' et vÃ©rifie leur visibilitÃ© publique en
# s'appuyant sur le dÃ©faut 'simulated' â€” les faire basculer aussi en
# 'scraped' romprait cette hypothÃ¨se (annonces 'interne' alors filtrÃ©es
# hors du catalogue public) sans aucun rapport avec le confort de dev local
# visÃ© ici. ConstatÃ© en CI : ce changement, appliquÃ© sans cette garde,
# faisait Ã©chouer test_publication_reussie_definit_date_publication_et_apparait_publiquement.
# 2026-08-17 (audit final) : défaut local passé de 'scraped' à 'all' —
# 'scraped' seul cachait les annonces 'interne' (réellement publiées via
# /publier) derrière un 404 public alors qu'elles étaient correctement
# en_ligne en base ; piège concret pour toute démo publier→consulter la
# fiche. 'all' montre les deux jeux à la fois (cf. SOURCES_PAR_DATASET,
# annonces/managers.py) ; reste surchargeable via .env/variable d'env pour
# revenir ponctuellement à 'simulated' ou 'scraped' seul en local.
if 'test' not in sys.argv:
    AKAL_DATASET = env('AKAL_DATASET', default='all')

# En dÃ©veloppement, autoriser toutes les origines CORS
CORS_ALLOW_ALL_ORIGINS = True

# localhost sert en HTTP simple : un cookie Secure+SameSite=None ne serait
# jamais envoyÃ© par le navigateur. cf. SIMPLE_JWT dans base.py.
SIMPLE_JWT = {**SIMPLE_JWT, 'AUTH_COOKIE_SECURE': False, 'AUTH_COOKIE_SAMESITE': 'Lax'}
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
