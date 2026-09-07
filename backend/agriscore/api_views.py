"""
Vue API du pipeline AgriScore.

    GET /api/parcelles/<uuid:parcelle_id>/passeport/  → Passeport complet (JSON)

Publique (comme le catalogue). Un appel NON CACHÉ déclenche jusqu'à 5 requêtes
vers des API externes (Copernicus, Open-Meteo, SoilGrids, OSRM). Trois
barrières empêchent un appelant de saturer ces sources :

  1. Throttle DRF (scope ``passeport``) — plafond de requêtes/h/IP.
  2. Cache Redis du passeport ASSEMBLÉ, par parcelle (``TTL_PASSEPORT_S``) :
     le pipeline ne tourne qu'une fois par parcelle et par TTL, quel que soit
     le nombre d'appelants ou d'IP. Une fois une parcelle vue, tout appel
     ultérieur est servi sans aucun appel externe.
  3. Verrou de calcul par parcelle (``TTL_VERROU_CALCUL_S``) : pendant qu'un
     passeport se calcule, les requêtes concurrentes pour la MÊME parcelle
     reçoivent un 429 « analyse en cours » plutôt que de relancer le pipeline
     en parallèle (anti-emballement / cache stampede).

En plus, chaque agent a son propre cache Redis par dimension/coordonnées
(agriscore/agents/_cache.py) : deux parcelles voisines partagent les collectes.

Redis reste une optimisation : cache injoignable ⇒ on recalcule (jamais un
500), verrou injoignable ⇒ on laisse passer (jamais un 503 permanent).
"""

import logging

from django.core.cache import cache
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from agriscore.passeport import passeport_parcelle
from annonces.models import Annonce, Parcelle
from annonces.serializers import _flouter_position

logger = logging.getLogger(__name__)

# TTL du passeport assemblé, mis en cache par parcelle_id (la vue connaît la
# parcelle — pas besoin de repasser par les coordonnées). Aligné sur le plus
# court des TTL d'agent (NDVI, 24 h, fenêtre glissante de 12 mois) : 12 h
# laisse une marge, la donnée ne bouge pas d'une demi-journée à l'autre.
TTL_PASSEPORT_S = 60 * 60 * 12

# Verrou anti-emballement. Un run à froid dure ~5 s (5 agents parallèles,
# chacun borné par AGRISCORE_HTTP_TIMEOUT_S) ; 60 s couvre largement, et une
# clé oubliée (process tué en plein calcul) expire d'elle-même.
TTL_VERROU_CALCUL_S = 60


def _cache_get(cle):
    try:
        return cache.get(cle)
    except Exception:  # noqa: BLE001 — cache HS : on recalcule
        logger.warning("cache passeport indisponible en lecture (%s)", cle, exc_info=True)
        return None


def _cache_set(cle, valeur, ttl):
    try:
        cache.set(cle, valeur, ttl)
    except Exception:  # noqa: BLE001
        logger.warning("cache passeport indisponible en écriture (%s)", cle, exc_info=True)


def _poser_verrou(cle):
    """True si le verrou est posé (ou si le cache est HS — fail-open : mieux
    vaut un calcul concurrent redondant qu'un 503 permanent quand Redis est
    éteint). False seulement si un autre calcul détient déjà le verrou."""
    try:
        # cache.add() : True si la clé n'existait pas, False si elle existe,
        # None si le cache est injoignable (IGNORE_EXCEPTIONS).
        pose = cache.add(cle, True, TTL_VERROU_CALCUL_S)
        return pose is not False
    except Exception:  # noqa: BLE001
        return True


def _lever_verrou(cle):
    try:
        cache.delete(cle)
    except Exception:  # noqa: BLE001
        pass


class PasseportParcelleAPIView(APIView):
    """GET /api/parcelles/<uuid:parcelle_id>/passeport/"""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_scope = 'passeport'
    throttle_classes = [ScopedRateThrottle]

    @extend_schema(
        operation_id='parcelle_passeport',
        parameters=[OpenApiParameter('parcelle_id', str, OpenApiParameter.PATH)],
        responses={200: dict, 404: dict, 422: dict, 429: dict},
        description="Passeport AgriScore complet d'une parcelle (score, fiabilité, "
                    "détail par dimension, cultures suggérées).",
    )
    def get(self, request, parcelle_id):
        parcelle = get_object_or_404(
            Parcelle.objects.only('id', 'latitude', 'longitude'), pk=parcelle_id
        )
        if parcelle.latitude is None or parcelle.longitude is None:
            return Response(
                {'detail': "Parcelle non géolocalisée : passeport indisponible."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        cle_resultat = f"agriscore:passeport:{parcelle.id}"
        en_cache = _cache_get(cle_resultat)
        if en_cache is not None:
            return Response(en_cache)

        # Un seul calcul à la fois par parcelle : les requêtes concurrentes
        # (autre onglet, autre visiteur, script) repartent avec un 503 que le
        # front sait retenter, au lieu de relancer 5 appels externes chacune.
        cle_verrou = f"agriscore:passeport:calcul:{parcelle.id}"
        if not _poser_verrou(cle_verrou):
            reponse = Response(
                {'detail': "Analyse en cours pour cette parcelle, réessayez dans quelques instants."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            # 429 (pas 503) : un verrou tenu est un throttle attendu, pas un
            # incident serveur — reste sous le seuil ERROR de django.request /
            # Sentry. Retry-After = durée max d'un run à froid.
            reponse['Retry-After'] = str(TTL_VERROU_CALCUL_S)
            return reponse

        try:
            lat, lon = parcelle.latitude, parcelle.longitude

            # Confidentialité : cet endpoint est public et anonyme, et le
            # pipeline interroge des sources à 10 m de résolution (NDVI
            # Sentinel-2). Si une annonce de cette parcelle masque sa
            # localisation, calculer sur les coordonnées EXACTES rendrait
            # l'emplacement retrouvable par comparaison de passeports —
            # contournement du floutage de la fiche. On calcule sur la MÊME
            # position floutée déterministe que la fiche publique
            # (annonces/serializers.py::_flouter_position, graine = parcelle_id).
            if Annonce.objects.filter(
                parcelle_id=parcelle.id, loc_confidentielle=True
            ).exists():
                lat, lon = _flouter_position(lat, lon, parcelle.id)

            passeport = passeport_parcelle(lat, lon)
            passeport['parcelle_id'] = str(parcelle.id)
            _cache_set(cle_resultat, passeport, TTL_PASSEPORT_S)
            return Response(passeport)
        finally:
            _lever_verrou(cle_verrou)
