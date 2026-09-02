# Onboarding — variables d'environnement & secrets

Ce doc explique **comment obtenir les valeurs**, pas ce qu'elles sont : aucune
vraie valeur n'apparaît ici, volontairement (ce fichier est commité, donc
public au sens git — tout secret qui y atterrirait serait aussi grave qu'un
`.env` commité par erreur).

## Pourquoi c'est gitignoré

`backend/.env`, `frontend/.env.local` et `backend/firebase-service-account.json`
sont exclus du dépôt (`.gitignore`) — volontairement, pas un oubli. Chacun
tourne avec ses propres valeurs (base locale, éventuellement un projet
Firebase/Google de test différent), et certaines de ces valeurs sont de
vrais secrets qui ne doivent jamais transiter par l'historique git (même
supprimées ensuite, elles y restent).

`backend/.env.example` et `frontend/.env.example` — eux, commités — listent
déjà **quelles variables** sont attendues. Ce doc couvre l'étape d'après :
comment récupérer les **valeurs** à mettre dedans.

## Deux niveaux de sensibilité, deux façons de les transmettre

| | Exemples | Où | Comment le transmettre |
|---|---|---|---|
| **Pas un vrai secret** — visible dans le JS envoyé au navigateur de toute façon | tout `NEXT_PUBLIC_*` (Google Client ID, config Firebase web) | `frontend/.env.local` | Message d'équipe (Slack/Discord/Notion) — même en clair, sans risque réel |
| **Vrai secret** — donne un accès admin/serveur | `backend/firebase-service-account.json` (clé privée Firebase Admin), `GOOGLE_CLIENT_ID` côté back (même valeur que le front, mais gardé au même endroit sécurisé par cohérence), `SECRET_KEY` Django | `backend/.env`, fichier JSON dédié | Gestionnaire de mots de passe partagé (1Password, Bitwarden…) — jamais en clair sur un chat |

## Étapes pour un nouveau collaborateur

1. `cp backend/.env.example backend/.env` et `cp frontend/.env.example frontend/.env.local`
2. Demander les valeurs à l'équipe (canal habituel pour les `NEXT_PUBLIC_*`,
   vault partagé pour le reste) et les coller dans les deux fichiers.
3. Récupérer `firebase-service-account.json` depuis le vault partagé, le
   déposer à la racine de `backend/` (jamais ailleurs, jamais renommé —
   c'est le chemin que lit `accounts/auth_api_views.py`).
4. `python manage.py migrate` puis `python manage.py runserver` côté
   backend, `npm install && npm run dev` côté frontend.

## Clés AgriScore — toutes facultatives

Le pipeline AgriScore (`backend/agriscore/`, endpoint
`GET /api/parcelles/<id>/passeport/`) interroge des sources externes. **Sans
aucune clé, il tourne quand même** : l'agent non provisionné passe en
`statut="indisponible"` et le score se calcule sur les dimensions restantes.
`manage.py check` / `test` / `runserver` passent sans clé.

Contrainte projet (cf. modération / alertes) : **aucun palier payant**. Ces
trois variables sont des inscriptions gratuites, pas de facturation.

| Variable | Agent | Où l'obtenir | Sensibilité |
|---|---|---|---|
| `CDSE_CLIENT_ID` + `CDSE_CLIENT_SECRET` | NDVI (Sentinel-2) | Compte gratuit sur [dataspace.copernicus.eu](https://dataspace.copernicus.eu) → *Sentinel Hub* → créer un client OAuth2. Le secret n'est montré qu'une fois | **Vrai secret** — vault partagé |
| `OPENTOPOGRAPHY_API_KEY` | topo GLO-30 **optionnel** | Compte gratuit sur [portal.opentopography.org](https://portal.opentopography.org) → *Request API Key*. **Non nécessaire** : le pipeline par défaut utilise Open-Meteo Elevation (GLO-90, sans clé) ; cette clé ne sert qu'à l'agent `AgentTopoReel` (GLO-30) si on le branche explicitement | Secret léger — vault |

`AGRISCORE_HTTP_TIMEOUT_S` (défaut `10`) : réglage, pas un secret.

Les valeurs sont dans `backend/.env.example` (vides) — récupère-les au vault
partagé si l'équipe les a provisionnées, sinon laisse vide (dégradé assumé).

## Option plus légère : ne pas toucher au backend du tout

Si tu ne travailles que sur le frontend, tu n'as besoin **que** des
`NEXT_PUBLIC_*` (jamais de vrai secret) : pointe
`NEXT_PUBLIC_API_URL` vers le backend partagé déployé sur Render plutôt que
sur `localhost:8000`, sans installer Postgres/PostGIS/Redis/MinIO en local.
`backend/firebase-service-account.json` reste alors uniquement sur Render —
jamais copié sur ton poste.

⚠️ Ça suppose que le service Render autorise ton origine locale
(`http://localhost:3000`) dans `CORS_ALLOWED_ORIGINS`/`CSRF_TRUSTED_ORIGINS`
— cf. `backend/README.md`, section Firebase & Google OAuth, pour le détail
et la mise en garde (à ne faire que si ce service Render est un bac à sable
d'équipe, pas déjà le service de prod réel).

## Connexion téléphone (SMS) sans vraie facturation Firebase

Tant qu'aucun compte de facturation n'est activé sur le projet Firebase, un
vrai SMS ne peut pas être envoyé — n'importe quel numéro échouera. Un
**numéro de test** est configuré côté Firebase Console
(Authentication → Sign-in method → Phone → Phone numbers for testing) :
demande-le à l'équipe (même canal que les `NEXT_PUBLIC_*`, ce n'est pas un
secret) plutôt que d'essayer un vrai numéro.
