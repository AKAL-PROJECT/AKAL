# AKAL • ⴰⴽⴰⵍ • La Terre

Plateforme d'intelligence agronomique et foncière.  
Société Marocaine d'Ingénierie Immobilière — EIGSI Casablanca 2026.

## Structure du repo

| Dossier | Responsable | Stack |
|---------|-------------|-------|
| `frontend/` | Mégane | Next.js 14 + Tailwind CSS |
| `backend/` | Ibrahim | Django + DRF + PostGIS |

## Conventions de branches

- `main` → production, protégée
- `develop` → intégration commune
- `feat/front/[nom]` → features front (Mégane)
- `feat/back/[nom]` → features back (Ibrahim)
- `fix/[nom]` → corrections

## Démarrage rapide (front-end)

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

## Variables d'environnement & secrets

`backend/.env.example` et `frontend/.env.example` documentent les variables
attendues ; aucune vraie valeur n'est commitée (voir `.gitignore`). Pour
savoir comment récupérer ces valeurs en tant que nouveau collaborateur :
[docs/ONBOARDING_SECRETS.md](docs/ONBOARDING_SECRETS.md).
