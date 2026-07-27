# Auth module — design

Date: 2026-07-24
Branch: `feat/auth`

## Context

`docs/AKAL_Contrat_Donnees_v1.2.md` (§ ligne 136) place l'authentification hors
périmètre v1 : lecture publique seulement, écriture (auth JWT httpOnly,
favoris, dépôt, messagerie) prévue pour l'avenant v1.1. Le frontend tourne en
attendant sur `NEXT_PUBLIC_USE_MOCKS`.

État actuel : `accounts.User` existe (email login, UUID pk, rôles
`PROPRIETAIRE`/`INVESTISSEUR`/`ADMIN`) mais sans JWT, serializers, vues, ni
urls. Aucune page login/signup ni guard côté frontend.

Ce document couvre l'implémentation de ce module : comptes, rôles, sessions,
JWT, pages login/signup, guards.

## Addendum (2026-07-24, après retour produit) : pas de rôle à l'inscription

La section "Rôles" ci-dessous décrivait initialement un choix VENDEUR/
ACHETEUR obligatoire au signup. Retour produit : acheteur/vendeur n'est pas
une identité permanente sur AKAL — une même personne peut chercher une terre
aujourd'hui, en vendre une demain, ou faire les deux à la fois. Le formulaire
d'inscription ne demande donc plus de rôle.

Ce qui change par rapport à la conception initiale :

- `SignupSerializer` n'expose plus de champ `role` du tout (un `role` envoyé
  quand même dans le payload est silencieusement ignoré par DRF).
- `User.role` devient optionnel (`blank=True, default=''`) — migration
  `0004_alter_user_role`. `ADMIN` reste réservé au staff
  (`createsuperuser`) ; `VENDEUR`/`ACHETEUR` restent des valeurs valables
  dans `Role.choices` pour un usage futur (cf. ci-dessous), mais ne sont
  plus assignées à l'inscription.
- Après inscription, redirection vers `/bienvenue` (pas `/compte`) : écran
  "Que souhaitez-vous faire ?" avec deux choix (Explorer les parcelles /
  Déposer une annonce), qui reflètent une intention du moment plutôt qu'une
  étiquette figée sur le compte.
- Piste future (hors scope de cette itération) : dériver des capacités du
  comportement plutôt que d'un champ `role` unique — ex. `peut explorer`,
  `peut contacter`, `peut vendre` — le dépôt d'une première annonce faisant
  naturellement d'un utilisateur un "vendeur" sans qu'il ait eu à le
  déclarer.

## Rôles

Renommage `PROPRIETAIRE` → `VENDEUR`, `INVESTISSEUR` → `ACHETEUR` (`ADMIN`
inchangé). Migration schéma + `RunPython` pour remapper les lignes
existantes. Impacte `accounts/models.py`, les 3 commandes de seed
(`seed_test_data.py`, `seed_parcelles.py`, `seed_demo.py`) et
`docs/BACKEND.md`.

L'inscription publique (`/auth/signup`) n'accepte que `VENDEUR` ou `ACHETEUR`
— `ADMIN` reste réservé à `createsuperuser` / l'admin Django.

## Backend

- Ajout `djangorestframework-simplejwt` (+ app `token_blacklist` pour la
  révocation au logout et la rotation des refresh tokens).
- Vues d'auth dans `accounts/` (pas de nouvelle app — cohérent avec
  `BACKEND.md` qui décrit déjà `accounts` comme "Authentification & profils").
- `CookieJWTAuthentication` (classe DRF custom) : lit l'access token depuis un
  cookie httpOnly plutôt que le header `Authorization` (simplejwt ne supporte
  pas les cookies nativement).

### Endpoints (`/api/auth/`)

| Méthode | Path | Effet |
|---|---|---|
| POST | `/signup` | Crée le compte (rôle VENDEUR/ACHETEUR), pose les cookies |
| POST | `/login` | Vérifie email+password, pose les cookies |
| POST | `/logout` | Blacklist le refresh token, efface les cookies |
| POST | `/refresh` | Lit le refresh cookie, réémet access (+ refresh tourné) |
| GET | `/me` | Retourne l'utilisateur courant ou 401 |

### Cookies

- `access_token` : path `/`, httpOnly.
- `refresh_token` : path `/api/auth/`, httpOnly.
- `Secure` + `SameSite=None` en prod (frontend `akal.ma`, backend
  `.onrender.com` — sites différents, cf. `prod.py`) ; `SameSite=Lax` en dev.
- `CORS_ALLOW_CREDENTIALS = True` à ajouter dans `base.py` (absent
  actuellement, requis pour que les cookies passent cross-origin).

### CSRF

L'auth par cookie contourne la vérification CSRF par défaut de DRF (seule
`SessionAuthentication` la déclenche). `CookieJWTAuthentication` appelle donc
`enforce_csrf()` sur les méthodes non-safe, en réutilisant le mécanisme CSRF
standard de Django (double-submit cookie), dont `CSRF_COOKIE_SECURE` était
déjà présent — mais inutilisé — dans `prod.py`. Le frontend renvoie la valeur
du cookie `csrftoken` en header `X-CSRFToken` sur les requêtes mutantes.

### Sécurité complémentaire

- Throttle DRF scoped sur `/login` (ex. 5/min/IP) contre le brute-force.
- Messages d'erreur génériques sur `/login` (ne pas révéler si l'email
  existe).

## Frontend (Next.js 16 App Router)

- `src/lib/auth-api.ts` : wrapper des 5 endpoints au-dessus de `apiFetch`.
  Les appels client passent `credentials: "include"` ; les appels
  server-side (Server Components/Actions) doivent forwarder manuellement le
  header `Cookie` de la requête entrante via `next/headers` (`fetch` dans un
  Server Component n'hérite pas automatiquement des cookies du visiteur).
- `src/app/login/page.tsx`, `src/app/signup/page.tsx` : formulaires avec
  Server Actions (`"use server"`), posent les cookies via `cookies().set(...)`
  en miroir de la réponse backend, puis redirigent.
- `middleware.ts` (racine projet) : garde "fast-path" — vérifie la présence
  du cookie `access_token` sur les routes protégées (`/compte`), redirige
  vers `/login?next=...` sinon. Vérifie la présence uniquement (pas la
  signature, le secret n'est pas côté frontend) ; l'autorisation réelle reste
  imposée par le backend à chaque appel API.
- `src/app/compte/page.tsx` : page protégée minimale, Server Component
  appelant `GET /api/auth/me` ; redirige vers `/login` sur 401 (ceinture et
  bretelles avec le middleware).
- Logout : Server Action appelant `POST /api/auth/logout`, efface les
  cookies, redirige vers `/`.
- `Navbar.tsx` : état minimal auth-aware (login/signup vs "Mon compte" /
  déconnexion), lu server-side via présence du cookie.

## Flux

1. Signup/Login → validation backend → cookies posés → redirection
   `/compte`.
2. Appel API authentifié → cookie transmis → `CookieJWTAuthentication` valide
   → 200, ou 401 si expiré.
3. Sur 401, `apiFetch` tente un `POST /auth/refresh` puis rejoue la requête
   une fois ; si le refresh échoue aussi, propage le 401 (redirection login
   côté appelant).
4. Logout → blacklist du refresh token, cookies effacés, redirection `/`.

## Erreurs

- Signup : email dupliqué / mot de passe faible → 400 avec `fieldErrors` DRF,
  déjà géré par `ApiError` dans `api.ts` — aucun nouveau format à gérer.
- Login : identifiants invalides → 400 générique `{"detail": "..."}`.
- Page protégée sans session valide → redirection `/login?next=...`, jamais
  une page 401 brute.

## Tests

- Backend : `accounts/tests.py`, `APITestCase` (convention du repo — runner
  Django, pas de pytest ; cf. `annonces/tests.py`). Cas couverts : chemin
  heureux des 5 endpoints, email dupliqué, mauvais mot de passe, token
  expiré/invalide/absent sur `/me`, rotation du refresh, logout invalide
  l'ancien refresh token.
- Frontend : test vitest sur le parsing d'erreurs du wrapper auth (même
  pattern que `mapAnnonceToParcelle.test.ts`). Middleware/Server
  Actions/flux cookie ne sont pas testables unitairement de façon
  significative — vérification manuelle en navigateur (signup → login →
  page protégée → logout) avant de considérer la tâche terminée.
