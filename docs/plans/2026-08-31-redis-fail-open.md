# Résilience Redis — `IGNORE_EXCEPTIONS` global (fail-open du throttling)

Date : 2026-08-31
Branche : `finalisation/ux-ui-carte-filtres`
Commit du code : `f7713b2` — *feat(gis): cache Redis des limites administratives + résilience Redis globale*

Ce document fige la décision d'architecture derrière les deux lignes ajoutées
à `backend/akal/settings/base.py` dans ce commit. Le code est validé (GO) ;
ce fichier en est la justification écrite, à présenter au jury et à retrouver
en cas de réexamen.

## Contexte

Le commit `f7713b2` met en cache Redis la réponse GeoJSON des 3 endpoints
`/api/geo/limites/{regions,provinces,communes}/` (TTL 24 h). Le repli est
géré localement dans `geo/api_views.py` (`_cache_get` / `_cache_set` :
`try/except` → log `WARNING` → `None` → la vue rejoue PostGIS).

En écrivant le test `test_redis_indisponible_repli_sur_postgis`
(`geo/tests.py`), le repli local s'est révélé **nécessaire mais insuffisant** :
avec un cache pointé sur un port Redis fermé, la requête ne mourait pas dans
la vue mais **avant**, dans la couche de throttling de DRF, avec un `500`.

## Le problème, prouvé depuis le code

DRF exécute le contrôle de débit **avant** le handler de vue.
`rest_framework/views.py` :

```python
def initial(self, request, *args, **kwargs):
    ...
    self.perform_authentication(request)
    self.check_permissions(request)
    self.check_throttles(request)          # ← ici

def dispatch(self, request, *args, **kwargs):
    ...
    self.initial(request, *args, **kwargs) # ← avant le handler
    handler = getattr(self, request.method.lower(), self.http_method_not_allowed)
    response = handler(request, *args, **kwargs)   # ← la vue (list(), create()...)
```

`SimpleRateThrottle` (classe mère de `AnonRateThrottle`, `UserRateThrottle`,
`ScopedRateThrottle`) lit le cache par défaut dans `allow_request()` :

```python
# rest_framework/throttling.py
from django.core.cache import cache as default_cache

class SimpleRateThrottle(BaseThrottle):
    cache = default_cache
    def allow_request(self, request, view):
        ...
        self.history = self.cache.get(self.key, [])   # ← accès Redis
        ...
        self.cache.set(self.key, self.history, self.duration)
```

`base.py` déclare `AnonRateThrottle` + `UserRateThrottle` en
`DEFAULT_THROTTLE_CLASSES` : **tous** les endpoints de l'API passent par cet
accès cache, y compris le catalogue public, les fiches, les favoris, et les
endpoints d'authentification.

Sans configuration de résilience, `django_redis` lève `ConnectionInterrupted`
quand Redis est injoignable. Levée dans `check_throttles()`, cette exception
tombe **avant toute logique métier** → `500` sur la quasi-totalité de l'API.
Le cache — une simple optimisation — deviendrait une dépendance dure de tout
le site.

Vérifié empiriquement (audit go-live, `docker stop akal_redis`) : sans la
correction, `/api/annonces/` → `500` ; avec, `/api/annonces/` → `200`,
`/api/geo/limites/regions/` → `200` (PostGIS), `/api/favoris/` → `401`
(auth intacte), `/admin/` toujours protégé.

## Décision

Garder les deux lignes de `f7713b2`, dans `CACHES['default']['OPTIONS']` puis
juste après le bloc `CACHES` :

```python
'IGNORE_EXCEPTIONS': True,
...
DJANGO_REDIS_LOG_IGNORED_EXCEPTIONS = True
```

- `IGNORE_EXCEPTIONS: True` — sur erreur Redis, `cache.get()` renvoie `None`
  et `cache.set()` est un no-op, **au lieu de lever**.
- `DJANGO_REDIS_LOG_IGNORED_EXCEPTIONS = True` — chaque exception ainsi
  ignorée est loggée en `WARNING` sur le logger `django_redis.cache`. Sans
  cette seconde ligne, la panne serait masquée **silencieusement**.

## Le compromis assumé

Pendant une panne Redis, le throttling DRF **échoue « ouvert »** : les
compteurs ne sont plus lus, les requêtes passent sans être comptabilisées.
Cela concerne aussi les scopes serrés (`login` 5/min, `signup` 5/h,
`annonce_create`, `photo_upload`, `message`, `whatsapp`).

C'est le compromis standard, et il est acceptable ici :

1. **Redis éteint est déjà un incident** qui se voit (logs, et santé de
   l'instance Render). Servir quelques minutes de trafic non throttlé est
   préférable à un `500` généralisé qui, lui, ressemble à une panne totale.
2. **Le throttling est un filet, pas la seule défense.** Ce qui protège
   réellement `/admin/` contre le brute-force est **django-axes**, dont le
   handler est **adossé à la base de données**, pas à Redis
   (`AXES_ONLY_ADMIN_SITE = True`, `AXES_FAILURE_LIMIT = 5`). Une panne Redis
   ne l'affaiblit pas.
3. **Aucun autre contrôle n'est touché.** Authentification (JWT cookies
   httpOnly), permissions DRF, garde-fou CSRF double-submit, confidentialité
   de localisation, endpoint WhatsApp derrière `IsAuthenticated` :
   tout continue de s'appliquer, rien de tout cela ne lit Redis.

Autrement dit, la surface dégradée pendant une panne Redis se limite à :
*« un attaquant pourrait tenter plus de connexions grand public par minute
que d'habitude »* — bornée par le fait que la panne est visible et courte,
et que `/admin/` reste couvert par axes.

## Alternatives écartées

- **Ne rien changer, garder le repli local seul** (`geo/api_views.py`) —
  écarté : prouvé insuffisant, le `500` vient de `check_throttles()`, en
  amont de toute vue. Le repli local reste utile (il évite un aller-retour
  Redis inutile et documente l'intention au bon endroit) mais ne couvre pas
  le chemin critique.
- **`try/except` maison autour de chaque accès cache applicatif** — ne
  couvrirait pas le code tiers (DRF throttling), qui est précisément le point
  de défaillance. Il faudrait sous-classer les 3 throttles DRF pour intercepter
  `ConnectionInterrupted` : plus de code, plus fragile, pour le résultat
  qu'`IGNORE_EXCEPTIONS` donne en une ligne testée par la lib.
- **Cache local-memory en secours (`LocMemCache`)** — ne partage rien entre
  workers/instances ; un throttle par worker n'a pas de sens. Et ça masque la
  panne au lieu de la rendre visible.
- **`IGNORE_EXCEPTIONS` sans la ligne de log** — écarté : masquerait la panne.
  La visibilité de l'incident est une condition de la décision.

## Observabilité — la panne reste visible

- ✅ **Console / logs Render** : django-redis 7.0.0 logue chaque exception
  ignorée via `logger.exception("Exception ignored")` — donc niveau `ERROR`
  sur le logger `django_redis.cache` — dès que
  `DJANGO_REDIS_LOG_IGNORED_EXCEPTIONS = True` (la 2ᵉ ligne du commit). Le
  logger `root` de `settings.LOGGING` envoie tout ça sur `console` (stdout,
  capturé par Render). Vérifié par les tests (`assertLogs(level='ERROR')`).
- ✅ **Sentry** : `LoggingIntegration(level=None, event_level='ERROR')`
  capture les `ERROR`+ → en prod (avec `SENTRY_DSN`), une panne Redis
  **remonte comme événement Sentry** sans câblage supplémentaire.
- Le repli GIS local (`geo/api_views.py`) logue en plus un `WARNING`
  (`geo.api_views`, console seulement) — redondant avec l'`ERROR`
  django-redis ci-dessus, gardé car il nomme la clé concernée.
- **Suivi post-freeze** (non bloquant) : si Redis « clignote » en prod et
  bruite Sentry, ajouter un throttle d'alerte ou un check de santé dédié
  plutôt que de baisser le niveau de log. À arbitrer avec du trafic réel.

## Tests de régression (GO)

- `geo/tests.py::CacheLimitesGeoTests` — 6 tests, dont
  `test_redis_indisponible_repli_sur_postgis` : cache pointé sur
  `redis://127.0.0.1:6399/0` + `IGNORE_EXCEPTIONS`, `assertLogs(WARNING+)`,
  `/api/geo/limites/*` → `200` (repli PostGIS), jamais `500`.
- `annonces/tests.py::ResilienceRedisThrottlingTests` — ajouté ici : même
  fixture « Redis mort », prouve que **le throttling ne fait pas `500`** —
  un `POST /api/annonces/` authentifié (`UserRateThrottle` +
  `ScopedRateThrottle`) → `201`, une lecture publique anonyme
  (`AnonRateThrottle`) → `200`, l'incident reste loggé
  (`assertLogs(...'django_redis.cache', level='ERROR')`).
- La suite throttling existante (`AnnonceCreateThrottleTests`,
  `PhotoUploadThrottleTests`, `LoginThrottleTests`, `SignupThrottleTests`,
  `PasswordResetThrottleTests`, `MessageThrottleTests`) tourne avec un vrai
  Redis et **reste verte** : le fail-open ne se déclenche que si Redis est
  réellement injoignable.

## Retour arrière

Retirer les deux lignes de `base.py`. Effet immédiat : une panne Redis
`500` de nouveau toute l'API à la couche throttle. À ne faire que si Redis
devient une dépendance garantie hautement disponible (cluster managé,
plusieurs nœuds) — ce qui n'est pas le cas sur l'hébergement gratuit actuel.
