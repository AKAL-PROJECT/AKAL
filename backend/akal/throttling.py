"""Throttles transverses (audit S2)."""

from rest_framework.throttling import AnonRateThrottle


class AnonRateThrottleBFF(AnonRateThrottle):
    """Plancher anonyme global, sauf pour le rendu serveur public de Next.js.

    Une requête authentifiée par le secret BFF mais sans IP visiteur (rendu
    SSR d'une page publique, cf. akal/middleware.py) viendrait sinon toujours
    de l'IP du serveur Next : tout le trafic SSR du site partagerait un seul
    quota 'anon' (1000/h). Le secret n'existe que côté serveur Next — un
    client ne peut pas se faire passer pour lui.
    """

    def allow_request(self, request, view):
        if getattr(request, 'akal_bff_sans_ip', False):
            return True
        return super().allow_request(request, view)
