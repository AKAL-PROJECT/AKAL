from .base import *

DEBUG = True
ALLOWED_HOSTS = ['localhost', '127.0.0.1']

# En développement, autoriser toutes les origines CORS
CORS_ALLOW_ALL_ORIGINS = True

# localhost sert en HTTP simple : un cookie Secure+SameSite=None ne serait
# jamais envoyé par le navigateur. cf. SIMPLE_JWT dans base.py.
SIMPLE_JWT = {**SIMPLE_JWT, 'AUTH_COOKIE_SECURE': False, 'AUTH_COOKIE_SAMESITE': 'Lax'}