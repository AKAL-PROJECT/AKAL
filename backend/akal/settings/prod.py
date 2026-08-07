from .base import *

DEBUG = False
ALLOWED_HOSTS = ['akal.ma', 'www.akal.ma','.onrender.com'] # Exemple de domaine pour la mise en prod[cite: 2]

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