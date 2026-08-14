from .base import *

DEBUG = True
ALLOWED_HOSTS = ['localhost', '127.0.0.1']

# AKAL_DATASET (cf. base.py, annonces/managers.py::dataset_actif()) :
# 'simulated' par défaut partout (prod incluse) — ici on bascule le défaut
# LOCAL sur 'scraped' pour que le catalogue public affiche les annonces
# importées (import_scraped_data) sans que chacun ait à exporter la
# variable d'env soi-même (source du "je ne vois pas les données scrapées"
# constaté en équipe — le serveur d'un poste avait la variable exportée
# manuellement dans son shell, jamais committée). Reste surchargeable via
# .env/variable d'env si besoin ponctuel de revenir sur 'simulated' en local.
AKAL_DATASET = env('AKAL_DATASET', default='scraped')

# En développement, autoriser toutes les origines CORS
CORS_ALLOW_ALL_ORIGINS = True

# localhost sert en HTTP simple : un cookie Secure+SameSite=None ne serait
# jamais envoyé par le navigateur. cf. SIMPLE_JWT dans base.py.
SIMPLE_JWT = {**SIMPLE_JWT, 'AUTH_COOKIE_SECURE': False, 'AUTH_COOKIE_SAMESITE': 'Lax'}