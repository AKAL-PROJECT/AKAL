import hashlib

from rest_framework.throttling import SimpleRateThrottle


class LoginEmailThrottle(SimpleRateThrottle):
    """Limite les tentatives de connexion par compte visé, quelle que soit
    l'IP (audit S2) — complète le throttle 'login' par IP : un attaquant qui
    change d'IP (botnet, proxys) reste bloqué sur un même email. L'email est
    haché dans la clé de cache (jamais stocké en clair dans Redis)."""

    scope = 'login_email'

    def get_cache_key(self, request, view):
        email = request.data.get('email') if hasattr(request.data, 'get') else None
        if not isinstance(email, str) or not email.strip():
            return None
        empreinte = hashlib.sha256(email.strip().lower().encode()).hexdigest()
        return self.cache_format % {'scope': self.scope, 'ident': empreinte}
