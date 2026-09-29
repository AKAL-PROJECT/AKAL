"""
Détermination de l'IP client (audit S2).

DRF identifie un visiteur anonyme (throttling) par son IP. Deux défauts
coexistaient :

  - X-Forwarded-For était cru tel quel (NUM_PROXIES non défini) : changer
    cet en-tête à chaque requête contournait tout le rate-limiting, login
    compris (brute force illimité).
  - login/inscription/reset passent par le serveur Next.js (BFF) : vu de
    Django, tous les utilisateurs avaient la même IP, donc un seul quota
    pour tout le site (5 inscriptions/h au total).

Ce middleware réécrit REMOTE_ADDR une fois pour toutes, puis supprime
X-Forwarded-For : tout le reste du code (throttles DRF avec NUM_PROXIES=0,
comptage de vues, axes) lit REMOTE_ADDR sans avoir à connaître la topologie.

  1. Requête BFF authentifiée par le secret partagé AKAL_PROXY_SECRET
     (en-tête X-Akal-Proxy-Secret, comparaison à temps constant) : on croit
     X-Akal-Client-IP, posé par le serveur Next (frontend/src/lib/entetes-
     backend.ts). Sans IP transmise (rendu serveur public), la requête est
     marquée `akal_bff_sans_ip` — cf. akal/throttling.py.
  2. Sinon : l'IP ajoutée par le proxy de confiance le plus proche
     (AKAL_TRUSTED_PROXY_COUNT, 1 sur Render, 0 en local), jamais l'entrée la
     plus à gauche de X-Forwarded-For, que le client contrôle.
"""

import hmac
import ipaddress

from django.conf import settings


def _ip_valide(valeur):
    if not valeur:
        return None
    valeur = valeur.strip()
    try:
        ipaddress.ip_address(valeur)
    except ValueError:
        return None
    return valeur


class ClientIPMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        meta = request.META
        secret_attendu = getattr(settings, 'AKAL_PROXY_SECRET', '')
        secret_recu = meta.pop('HTTP_X_AKAL_PROXY_SECRET', None)
        ip_transmise = meta.pop('HTTP_X_AKAL_CLIENT_IP', None)
        xff = meta.pop('HTTP_X_FORWARDED_FOR', None)

        if secret_attendu and secret_recu and hmac.compare_digest(
            secret_recu.encode(), secret_attendu.encode(),
        ):
            ip = _ip_valide(ip_transmise)
            if ip:
                meta['REMOTE_ADDR'] = ip
            else:
                request.akal_bff_sans_ip = True
        else:
            nb_proxys = getattr(settings, 'AKAL_TRUSTED_PROXY_COUNT', 0)
            if nb_proxys > 0 and xff:
                adresses = [a.strip() for a in xff.split(',') if a.strip()]
                if adresses:
                    ip = _ip_valide(adresses[max(0, len(adresses) - nb_proxys)])
                    if ip:
                        meta['REMOTE_ADDR'] = ip

        return self.get_response(request)
