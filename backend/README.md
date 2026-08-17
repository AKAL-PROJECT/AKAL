# AKAL — Backend

Ce dépôt contient le code source du backend de la plateforme **AKAL**, une solution d'intelligence agronomique et foncière.

## 🚀 À propos du projet

Le backend AKAL est développé avec le framework **Django**. Il expose une architecture de données robuste orientée autour du foncier agricole et gère les responsabilités suivantes :
- **Gestion des annonces** : Parcelles, photos, AgriScores et métadonnées agricoles.
- **Filtres complexes et cartographie** : Moteur de recherche avancé (facettes, filtres géographiques et fourchettes de prix).
- **Authentification multi-rôles** : Modèle d'utilisateurs sur-mesure séparant Propriétaires, Investisseurs et Administrateurs.
- **Messagerie interne** : Gestion des favoris et communication entre utilisateurs pour les transactions.

---

## 📋 Prérequis

Pour exécuter ce projet localement, votre environnement doit disposer des éléments suivants :

- **Python** (version 3.10 ou supérieure)
- **PostgreSQL** (version 13 ou supérieure)
- **PostGIS** (extension spatiale pour PostgreSQL)
- **GDAL / GEOS** (bibliothèques géospatiales requises par GeoDjango)

> **Note Windows** : Les bibliothèques GDAL/GEOS sont généralement incluses lors de l'installation de PostGIS via le StackBuilder de PostgreSQL.

---

## 🛠️ Installation & Setup Local

Suivez ces étapes pour configurer le projet sur votre machine.

### 1. Clonage du repo

```bash
git clone https://github.com/votre-org/akal.git
cd akal/backend
```

### 2. Création et activation de l'environnement virtuel

```bash
# Créer l'environnement virtuel
python -m venv akal_env

# L'activer (Windows)
.\akal_env\Scripts\activate

# L'activer (macOS/Linux)
source akal_env/bin/activate
```

### 3. Installation des dépendances

```bash
pip install -r requirements.txt
```

### 4. Configuration des variables d'environnement

Créez un fichier `.env` à la racine du dossier `backend/` et configurez vos accès à la base de données.

**Exemple de fichier `.env` (voir `.env.example` pour la liste complète) :**
```env
# Clé secrète Django (ne jamais la partager en production)
SECRET_KEY=votre-cle-secrete-super-securisee

# Connexion à la base de données PostGIS
# Format : postgis://USER:PASSWORD@HOST:PORT/NAME
DATABASE_URL=postgis://postgres:root@localhost:5432/akal_db

# MinIO (stockage des photos, cf. docker-compose.yml) — sans ça, tout
# upload de photo échoue. Voir .env.example pour les valeurs par défaut.
AWS_ACCESS_KEY_ID=akal
AWS_SECRET_ACCESS_KEY=akal12345
AWS_STORAGE_BUCKET_NAME=akal-media
AWS_S3_ENDPOINT_URL=http://localhost:9000
```

> Démarrer MinIO avant de lancer le serveur si vous testez le dépôt d'annonce : `docker compose up minio minio-init`.

> **Attention** : Assurez-vous d'avoir créé la base de données `akal_db` et d'y avoir activé l'extension PostGIS (`CREATE EXTENSION postgis;`).

#### Firebase (authentification Google / téléphone)

`PhoneLoginVerifyView` (SMS OTP) a besoin de `firebase_admin`, initialisé
paresseusement au premier appel réel de cette vue à partir d'un fichier de
credentials — **jamais au démarrage du serveur** : son absence n'empêche ni
`manage.py runserver`, ni `check`, ni `test` de fonctionner ; seule cette
vue répond alors `503 Connexion par téléphone temporairement indisponible`
(`GoogleLoginView`, elle, n'utilise pas `firebase_admin` et n'est pas
concernée).

- **En local** : générer une clé de compte de service depuis la [console
  Firebase](https://console.firebase.google.com/) → Paramètres du projet →
  Comptes de service → Générer une nouvelle clé privée, puis déposer le
  fichier téléchargé à la racine de `backend/` sous le nom
  `firebase-service-account.json` (déjà exclu par `.gitignore` — ne jamais
  le committer).
- **Sur Render** : utiliser la fonctionnalité *Secret Files* du service
  (Dashboard → service `akal-backend` → Environment → Secret Files) pour
  monter un fichier à `/app/firebase-service-account.json` (le service
  tourne dans `/app`, cf. `Dockerfile`) — aucune modification de code ou de
  `render.yaml` requise.
- **Avec Docker (hors Render)** : monter le fichier en volume au démarrage
  du conteneur, par exemple `-v ./firebase-service-account.json:/app/firebase-service-account.json:ro`
  (ou l'équivalent `volumes:` dans un `docker-compose.yml` de déploiement).

### 5. Application des migrations

Générez la structure de la base de données :

```bash
python manage.py makemigrations
python manage.py migrate
```

### 6. Insertion des données de test (Optionnel)

Pour peupler la base de données avec des parcelles fictives, des utilisateurs de test et des régions :

```bash
python manage.py seed_parcelles
```

### 7. Création du superutilisateur

```bash
python manage.py createsuperuser
# Suivez les instructions (email, mot de passe, etc.)
```

### 8. Lancement du serveur de développement

```bash
python manage.py runserver
```
Le backend sera accessible à l'adresse : `http://127.0.0.1:8000/`

---

## 🏗️ Architecture du code

Le projet Django est découpé en plusieurs applications (apps) modulaires :

- **`akal/`** : Cœur du projet (fichiers de configuration `settings`, routage principal `urls`).
- **`accounts/`** : Gestion des utilisateurs et de l'authentification. **Attention : le modèle `User` est sur-mesure et l'authentification se fait via l'adresse `email` (pas de `username`).**
- **`geo/`** : Référentiel territorial marocain (Régions, Provinces, Communes).
- **`annonces/`** : Le cœur métier. Modèles `Parcelle`, `Annonce`, `Photo` et `AgriScore`. Inclut la logique de filtrage avancé (`AnnonceFilter`) et l'algorithme de recommandation. Point d'entrée principal : `/annonces/`.
- **`messaging/`** : Logique de communication (conversations privées entre acheteurs/vendeurs, messagerie et favoris).

> 💡 **Documentation technique exhaustive** : Pour plonger dans les détails du schéma relationnel (entité-association), le fonctionnement du manager custom (`AnnonceManager`) ou les enums utilisés (types de terres marocaines), référez-vous au fichier complet **[`docs/BACKEND.md`](../docs/BACKEND.md)**.

---

## 🔧 Commandes utiles

Voici quelques commandes fréquemment utilisées pendant le développement :

```bash
# Ouvrir un shell interactif Django (avec accès direct à l'ORM)
python manage.py shell

# Lancer les tests unitaires
python manage.py test

# Vérifier que le projet ne contient pas d'erreurs de configuration
python manage.py check

# Réinitialiser la base de données (supprimer et recréer les tables)
python manage.py flush
```

### Formatage et Linting (Recommandé)

Afin de maintenir une base de code propre et homogène, nous recommandons l'utilisation de **Black** (formateur) et **Ruff** (linter).

```bash
# Installation des outils de dev
pip install black ruff

# Formater tout le code backend
black .

# Lancer l'analyse statique du code (linter)
ruff check .
```
