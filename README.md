# AKAL • ⴰⴽⴰⵍ • La Terre

Plateforme d'intelligence agronomique et foncière — mise en vente et évaluation
de terrains agricoles au Maroc.
Société Marocaine d'Ingénierie Immobilière — EIGSI Casablanca 2026.

## Stack

| Dossier | Responsable | Stack |
|---------|-------------|-------|
| `frontend/` | Mégane | Next.js 16 (App Router) · React 19 · TypeScript · variables CSS (Tailwind présent mais peu utilisé) · Leaflet |
| `backend/`  | Ibrahim | Django 6 · Django REST Framework · PostgreSQL + PostGIS · Redis · MinIO (S3) · pipeline AgriScore |

Services externes : Firebase (OTP SMS), Google OAuth, sources ouvertes AgriScore
(SoilGrids, Open-Meteo, Sentinel-2 / Copernicus, OSRM).

## Branches

- `main` → intégration / production, protégée (chaque merge passe par une PR + la CI).
- `finalisation/ux-ui-carte-filtres` → branche de finalisation en cours (contient le Passeport AgriScore).
- `feat/<domaine>` → une fonctionnalité, mergée dans `main` via PR puis supprimée.
- `fix/<sujet>` → une correction.

## Démarrage — du clone au serveur

Prérequis : Docker, Python 3.13, Node 20+, et les libs système GeoDjango
(`binutils libproj-dev gdal-bin` — cf. `backend/Dockerfile` pour la liste exacte).

### 1. Services (base de données, cache, stockage)

```bash
cd backend
docker compose up -d          # db (PostGIS, port 5433) + redis + minio + minio-init
```

### 2. Backend

```bash
cd backend
python -m venv akal_env && source akal_env/bin/activate
pip install -r requirements.txt

cp .env.example .env          # SECRET_KEY=change-me suffit en local ; DATABASE_URL pointe déjà sur :5433
python manage.py migrate
python manage.py import_geo_officiel        # référentiel géo officiel (12 régions / 75 provinces / 1536 communes)
python manage.py seed_demo                  # ~15 annonces de démonstration
python manage.py backfill_commune_geom      # rattache commune_geom aux parcelles seed (filtre province/commune du catalogue)
python manage.py createsuperuser            # accès /admin/
python manage.py runserver                  # → http://localhost:8000
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local     # puis passer NEXT_PUBLIC_USE_MOCKS à "false" et renseigner les clés (voir docs/ONBOARDING_SECRETS.md)
npm run dev                    # → http://localhost:3000
```

> `next build` (production) interroge le catalogue **au moment du build** :
> garder le backend démarré, ou builder après lui. Si l'API est injoignable,
> le build réussit quand même mais ne pré-génère aucune fiche (générées à la demande).

## Tests & qualité

```bash
# backend
cd backend && python manage.py test

# frontend
cd frontend && npm run lint && npx tsc --noEmit && npm test
```

La CI (`.github/workflows/ci.yml`) rejoue exactement ces validations sur chaque PR
vers `main` (PostGIS + Redis + MinIO provisionnés, backend démarré pour le build front).

## Déploiement

`backend/render.yaml` est un **blueprint Render de toute la pile** :

```
akal-frontend (Next.js)  →  akal-backend (Django/DRF)  →  akal-db (PostgreSQL + PostGIS)
                                                        →  akal-redis (Key Value)
                                                        →  S3 externe (médias)
```

1. **S3** : Render ne fournit pas d'object storage — créer un bucket compatible
   S3 (Cloudflare R2 / Backblaze B2, offre gratuite) ou un MinIO auto-hébergé.
2. **Render → New → Blueprint**, pointer sur ce dépôt. Les 4 composants sont créés.
3. Renseigner les variables `sync: false` de chaque service dans son onglet
   *Environment* (secrets + URLs connues seulement après le 1er déploiement :
   `NEXT_PUBLIC_API_URL`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`…).
4. Auth téléphone : déposer `firebase-service-account.json` dans
   *akal-backend → Environment → Secret Files* (`/app/firebase-service-account.json`).

PostGIS s'active tout seul (`manage.py ensure_postgis` avant `migrate`, cf.
`backend/Dockerfile`). Health checks : `/healthz/` (backend), `/` (frontend).

## Documentation

- `docs/BACKEND.md` — architecture backend, modèles, endpoints, déploiement.
- `docs/ONBOARDING_SECRETS.md` — comment obtenir les variables d'environnement et secrets.
- `docs/AKAL_Contrat_Donnees_v1.2.md` — contrat d'API frontend/backend.
- `docs/plans/` — notes de conception datées (auth, géo, résilience Redis, passeport front).
