from .base import *

DEBUG = False
# `.onrender.com` couvre l'URL par défaut du service Render ; `akal.ma` le
# domaine cible. Surchargeable par variable d'env (custom domain, autre PaaS)
# sans toucher au code — même mécanisme que CORS_ALLOWED_ORIGINS ci-dessous.
ALLOWED_HOSTS = env.list(
    'ALLOWED_HOSTS', default=['akal.ma', 'www.akal.ma', '.onrender.com'],
)

# CORS — sans ceci, prod hérite de CORS_ALLOWED_ORIGINS = ['http://localhost:3000']
# (base.py) et bloque silencieusement tout appel du frontend déployé.
# Surchargeable via variable d'env (ex. preview Vercel) sans toucher au code.
CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=['https://akal.ma', 'https://www.akal.ma'])

# CSRF (audit du 2026-07-30) — sans ceci, Django rejette toute requête
# POST/PATCH/DELETE authentifiée dont l'Origin diffère du host de l'API
# (CsrfViewMiddleware, appelé explicitement par
# accounts.authentication.enforce_csrf pour l'auth JWT par cookie) : c'est
# précisément le cas ici, frontend (akal.ma) et backend (*.onrender.com)
# étant deux sites distincts — cf. render.yaml et
# docs/plans/2026-07-24-auth-module-design.md. Même mécanisme de surcharge
# par variable d'env que CORS_ALLOWED_ORIGINS ci-dessus.
CSRF_TRUSTED_ORIGINS = env.list('CSRF_TRUSTED_ORIGINS', default=['https://akal.ma', 'https://www.akal.ma'])

# Sécurité renforcée pour la production
#
# SECURE_PROXY_SSL_HEADER (audit du 2026-08-03) — sans ceci, SECURE_SSL_REDIRECT
# boucle indéfiniment sur Render : le TLS est terminé au niveau du proxy/edge,
# la requête arrive à Django en HTTP interne, donc SecurityMiddleware la
# croit toujours non sécurisée et redirige vers HTTPS... vers la même URL,
# qui repasse par le même proxy. Render (comme la plupart des PaaS derrière
# un load balancer) transmet le schéma d'origine via l'en-tête
# X-Forwarded-Proto — c'est ce qu'il faut déclarer ici pour que Django fasse
# confiance à cet en-tête plutôt qu'à la connexion interne.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# HSTS (audit go-live du 2026-08-10) — force le navigateur à toujours
# revenir en HTTPS sur ce domaine, même si un lien/favori HTTP traîne
# quelque part. Sans danger à activer directement à la valeur max ici :
# SECURE_SSL_REDIRECT est déjà inconditionnel ci-dessus (toute requête HTTP
# est de toute façon redirigée), HSTS ne fait que renforcer une politique
# déjà en place, pas en introduire une nouvelle.
# SECURE_HSTS_PRELOAD ajoute seulement l'indicateur `preload` dans l'en-tête
# — ça n'inscrit PAS automatiquement le domaine dans la liste de préchargement
# des navigateurs (Chromium et consorts) : cette étape est un envoi manuel,
# séparé et volontaire sur https://hstspreload.org, jamais faite depuis ce
# fichier. Décision de la faire ou non laissée à plus tard, une fois le
# domaine réellement en production depuis un moment (le retrait d'un domaine
# de cette liste est lent, mieux vaut ne le soumettre qu'une fois confiant).
SECURE_HSTS_SECONDS = 31536000  # 1 an
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True


# ──────────────────────────────────────────────
# DATASET DE DÉMONSTRATION — piloté par variable d'env, défaut sûr
# ──────────────────────────────────────────────
#
# Défaut 'simulated' : la démo/soutenance ne sert QUE le jeu interne
# (source='interne', seed_demo/seed_parcelles). Sans variable explicite, les
# annonces scrapées Avito/Mubawab (photos et contenus tiers, géolocalisation
# au centroïde de commune, comptes bot, attributs manquants) ne sont JAMAIS
# exposées publiquement — c'est le durcissement pré-soutenance du 2026-08-30,
# ici sous forme de défaut plutôt que de valeur figée.
#
# Pour les montrer temporairement (captures d'écran, revue) : poser
# AKAL_DATASET=all (démo + scrapées) ou =scraped sur le service Render, puis
# revenir à 'simulated'. Valeurs : cf. annonces/managers.py::SOURCES_PAR_DATASET.
# Même mécanisme de surcharge par variable d'env que ALLOWED_HOSTS / CORS
# ci-dessus. L'import lui-même exige --force sous ce settings (garde-fou dans
# annonces/management/commands/import_scraped_data.py).
AKAL_DATASET = env('AKAL_DATASET', default='simulated')


# ──────────────────────────────────────────────
# OpenAPI / Swagger — réservé au staff en production
# ──────────────────────────────────────────────
#
# Le schéma complet de l'API n'a pas à être public en prod (surface d'attaque
# inutilement large). Reste ouvert en dev (base.py inchangé). N'affecte que
# /api/schema/ et /api/schema/swagger-ui/.
SPECTACULAR_SETTINGS = {
    **SPECTACULAR_SETTINGS,
    'SERVE_PERMISSIONS': ['rest_framework.permissions.IsAdminUser'],
}