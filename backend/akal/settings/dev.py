import sys

from .base import *

DEBUG = True
# `backend` : nom du service dans docker-compose.yml (racine) — le conteneur
# `frontend` appelle l'API via http://backend:8000 pour le rendu serveur, et
# Django rejette en 400 tout Host absent de cette liste, même en DEBUG.
# Surchargeable par variable d'env pour tout autre nom d'hôte.
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['localhost', '127.0.0.1', 'backend'])

# AKAL_DATASET (cf. base.py, annonces/managers.py::dataset_actif()) :
# 'simulated' par défaut partout (prod incluse) — ici on bascule le défaut
# LOCAL sur 'scraped' pour que le catalogue public affiche les annonces
# importées (import_scraped_data) sans que chacun ait à exporter la
# variable d'env soi-même (source du "je ne vois pas les données scrapées"
# constaté en équipe — le serveur d'un poste avait la variable exportée
# manuellement dans son shell, jamais committée). Reste surchargeable via
# .env/variable d'env si besoin ponctuel de revenir sur 'simulated' en local.
#
# `if 'test' not in sys.argv` : ce même settings.dev sert aussi à
# `manage.py test` (en local ET en CI, cf. .github/workflows/ci.yml). La
# suite de tests (annonces/tests.py, PublicationTests notamment) crée ses
# propres annonces source='interne' et vérifie leur visibilité publique en
# s'appuyant sur le défaut 'simulated' — les faire basculer aussi en
# 'scraped' romprait cette hypothèse (annonces 'interne' alors filtrées
# hors du catalogue public) sans aucun rapport avec le confort de dev local
# visé ici. Constaté en CI : ce changement, appliqué sans cette garde,
# faisait échouer test_publication_reussie_definit_date_publication_et_apparait_publiquement.
# 2026-08-17 (audit final) : défaut local passé de 'scraped' à 'all' —
# 'scraped' seul cachait les annonces 'interne' (réellement publiées via
# /publier) derrière un 404 public alors qu'elles étaient correctement
# en_ligne en base ; piège concret pour toute démo publier→consulter la
# fiche. 'all' montre les deux jeux à la fois (cf. SOURCES_PAR_DATASET,
# annonces/managers.py) ; reste surchargeable via .env/variable d'env pour
# revenir ponctuellement à 'simulated' ou 'scraped' seul en local.
# 2026-08-30 (hardening pre-soutenance) : defaut local ramene de 'all' a
# 'simulated' — la demo ne doit jamais afficher de contenu scrape (photos et
# textes tiers, geoloc au centroide de commune, comptes bot). 'simulated'
# montre quand meme toute annonce publiee localement via /publier
# (source='interne') ; seul l'echantillon scrape est masque. Pour le voir en
# local : `AKAL_DATASET=all ./manage.py runserver`. prod.py a le meme defaut
# 'simulated', pilotable par variable d'env AKAL_DATASET sur le service Render
# (2026-09-10 : defige, l'import scrape exige --force sous settings.prod).
if 'test' not in sys.argv:
    AKAL_DATASET = env('AKAL_DATASET', default='simulated')

# Démo locale : tous les comptes créés sur une même machine partagent
# légitimement la même IP — quotas d'inscription/connexion assouplis hors
# tests (la suite de tests vérifie les valeurs de production de base.py).
if 'test' not in sys.argv:
    REST_FRAMEWORK = {
        **REST_FRAMEWORK,
        'DEFAULT_THROTTLE_RATES': {
            **REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'],
            'signup': '50/hour',
            'login': '30/min',
            'password_reset': '20/hour',
        },
    }

# En développement, autoriser toutes les origines CORS
CORS_ALLOW_ALL_ORIGINS = True

# CSRF : la connexion JWT par cookie appelle enforce_csrf() (accounts/
# authentication.py) sur les méthodes non sûres — CsrfViewMiddleware vérifie
# alors l'Origin contre CSRF_TRUSTED_ORIGINS. localhost:3000 (front local) et
# localhost:8000 (self) par défaut ; surchargeable pour docker-compose
# full-stack (le service `frontend` appelle le backend via http://backend:8000).
CSRF_TRUSTED_ORIGINS = env.list(
    'CSRF_TRUSTED_ORIGINS',
    default=[
        'http://localhost:3000', 'http://localhost:8000',
        'http://127.0.0.1:3000', 'http://backend:8000',
    ],
)

# localhost sert en HTTP simple : un cookie Secure+SameSite=None ne serait
# jamais envoyé par le navigateur. cf. SIMPLE_JWT dans base.py.
SIMPLE_JWT = {**SIMPLE_JWT, 'AUTH_COOKIE_SECURE': False, 'AUTH_COOKIE_SAMESITE': 'Lax'}
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
