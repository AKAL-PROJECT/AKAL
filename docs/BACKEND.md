# 📘 AKAL — Documentation Technique

> Plateforme de vente de terrains agricoles au Maroc

---

## Table des matières

1. [Vue d'ensemble du projet](#1--vue-densemble-du-projet)
2. [Architecture technique](#2--architecture-technique)
3. [Structure du projet](#3--structure-du-projet)
4. [Schéma de base de données](#4--schéma-de-base-de-données)
5. [Détail des modèles par app](#5--détail-des-modèles-par-app)
6. [Relations entre les modèles](#6--relations-entre-les-modèles)
7. [Enums & choix prédéfinis](#7--enums--choix-prédéfinis)
8. [Configuration & prérequis](#8--configuration--prérequis)
9. [Management Commands](#9--management-commands)
10. [Logique Métier & Vues (Template)](#10--logique-métier--vues-template)
11. [API REST (DRF) & Swagger](#11--api-rest-drf--swagger)
12. [CORS](#12--cors)
13. [Cache Redis & Performance](#13--cache-redis--performance)
14. [Test de Charge (Locust)](#14--test-de-charge-locust)
15. [Déploiement en Production (Docker & IaC)](#15--déploiement-en-production-docker--iac)
16. [Journal des modifications](#16--journal-des-modifications)

---

## 1 — Vue d'ensemble du projet

**AKAL** est une plateforme web permettant de mettre en vente et d'évaluer des terrains agricoles au Maroc. Elle connecte les **propriétaires** de parcelles avec des **investisseurs** potentiels.

### Fonctionnalités principales

| Fonctionnalité | Description |
|---|---|
| 🏞️ **Annonces** | Publier des terrains à vendre avec photos, localisation GPS et données foncières |
| 📊 **AgriScore** | Évaluation automatique de la qualité agricole d'une parcelle |
| 💬 **Messagerie** | Communication directe entre acheteurs et vendeurs |
| ❤️ **Favoris** | Sauvegarder des annonces intéressantes |
| 🗺️ **Géolocalisation** | Positionnement PostGIS avec découpage territorial marocain (Région → Province → Commune) |

### Rôles utilisateurs

| Rôle | Permissions |
|---|---|
| `VENDEUR` | Créer des annonces, gérer ses parcelles, répondre aux messages |
| `ACHETEUR` | Consulter les annonces, contacter les propriétaires, gérer ses favoris |
| `ADMIN` | Gestion globale de la plateforme |

---

## 2 — Architecture technique

### Stack technologique

| Composant | Technologie | Version |
|---|---|---|
| **Backend** | Django | 6.0.6 |
| **API REST** | Django REST Framework (DRF) | ≥3.15.0 |
| **Documentation API** | drf-spectacular (OpenAPI / Swagger) | ≥0.28.0 |
| **CORS** | django-cors-headers | ≥4.6.0 |
| **Base de données** | PostgreSQL + PostGIS | — |
| **ORM spatial** | `django.contrib.gis` (GeoDjango) | inclus dans Django |
| **Cache** | Redis + django-redis | 7 (Alpine) / ≥5.4.0 |
| **Variables d'environnement** | django-environ | 0.14.0 |
| **Driver PostgreSQL** | psycopg2-binary | 2.9.12 |
| **Test de charge** | Locust | ≥2.29.0 |
| **Frontend** | Next.js | — |

### Dépendances système requises

| Dépendance | Rôle | Installation |
|---|---|---|
| **PostgreSQL** | Base de données relationnelle | [postgresql.org](https://www.postgresql.org/download/) |
| **PostGIS** | Extension spatiale de PostgreSQL | `CREATE EXTENSION postgis;` dans la DB |
| **GDAL** | Bibliothèque géospatiale (requis par GeoDjango) | [Guide d'installation GDAL](https://docs.djangoproject.com/en/6.0/ref/contrib/gis/install/) |
| **Pillow** | Traitement d'images (pour `ImageField`) | `pip install Pillow` |

---

## 3 — Structure du projet

```
AKAL/
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env                          # Variables d'environnement (non versionné)
│   ├── docker-compose.yml            # 🐳 Redis (test de charge)
│   ├── locustfile.py                 # 🦗 Scénarios de test de charge
│   │
│   ├── akal/                         # Configuration Django
│   │   ├── settings/
│   │   │   ├── base.py               # Settings communs (DRF, CORS, CACHES, Swagger)
│   │   │   ├── dev.py                # Settings développement (CORS_ALLOW_ALL)
│   │   │   └── prod.py               # Settings production
│   │   ├── urls.py                   # Routes principales (/api/, /admin/, /api/schema/)
│   │   ├── wsgi.py
│   │   └── asgi.py
│   │
│   ├── accounts/                     # 👤 Gestion des utilisateurs
│   │   ├── models.py                 # User custom (AbstractUser)
│   │   ├── admin.py
│   │   ├── apps.py
│   │   └── migrations/
│   │
│   ├── geo/                          # 🗺️ Découpage territorial
│   │   ├── models.py                 # Region, Province, Commune
│   │   ├── serializers.py            # 🆕 RegionSerializer (DRF)
│   │   ├── api_views.py              # 🆕 RegionListAPIView
│   │   ├── urls.py                   # 🆕 Routes API /api/geo/
│   │   ├── admin.py
│   │   ├── apps.py
│   │   └── migrations/
│   │
│   ├── annonces/                     # 🏞️ Cœur métier
│   │   ├── models.py                 # Parcelle, DonneesGeo, Annonce, StatistiqueAnnonce, AgriScore, Photo
│   │   ├── serializers.py            # 🆕 Serializers DRF (liste + détail)
│   │   ├── api_views.py              # 🆕 Vues API REST (DRF)
│   │   ├── api_urls.py               # 🆕 Routes API /api/annonces/
│   │   ├── managers.py               # AnnonceManager & AnnonceQuerySet
│   │   ├── filters.py                # AnnonceFilter (django-filter, template views)
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── management/
│   │   │   └── commands/
│   │   │       ├── seed_parcelles.py  # 🌱 Seed de données fictives (18)
│   │   │       ├── seed_demo.py       # 🆕 Seed démo intégration (~15 annonces)
│   │   │       └── seed_test_data.py  # 🚀 Seed de charge (100K annonces)
│   │   ├── migrations/
│   │   ├── urls.py                   # Routes template-based (rétrocompat)
│   │   └── views.py                  # CatalogueView + cache Redis (template)
│   │
│   ├── messaging/                    # 💬 Messagerie & favoris
│   │   ├── models.py                 # Favori, Conversation, Message
│   │   ├── admin.py
│   │   ├── apps.py
│   │   └── migrations/
│   │
│   └── media/                        # Fichiers uploadés (avatars, photos)
│       ├── photos/                   # Photos des annonces
│       └── seed_images/              # Cache images téléchargées (seed)
│
├── frontend/                         # Next.js (Mégane)
├── docs/                             # Documentation
│   └── BACKEND.md                    # ← Ce fichier
└── README.md
```

### Pourquoi 4 apps ?

| App | Responsabilité | Justification |
|---|---|---|
| `accounts` | Authentification & profils | Le `User` custom **doit** être dans sa propre app (contrainte Django). Évite les dépendances circulaires. |
| `geo` | Données de référence géographiques | Region/Province/Commune sont des données statiques réutilisables, indépendantes de la logique métier. |
| `annonces` | Logique métier principale | Parcelles, annonces, scoring, photos — le cœur de la plateforme. |
| `messaging` | Communication & engagement | Favoris, conversations, messages — fonctionnalités sociales isolées. |

---

## 4 — Schéma de base de données

### Diagramme des relations

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   REGION    │────<│   PROVINCE   │────<│   COMMUNE   │
│  (id: int)  │  1:N│  (id: int)   │  1:N│  (id: int)  │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                │ 1:N
                                                ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│    USER     │────<│   ANNONCE    │>────│  PARCELLE   │
│ (id: uuid)  │  1:N│  (id: uuid)  │  N:1│  (id: uuid) │
└──────┬──────┘     └──────┬───┬───┘     └──────┬──────┘
       │                   │   │                │ 1:1
       │            ┌──────┘   └──────┐         ▼
       │            │                 │  ┌─────────────┐
       │            ▼                 ▼  │  AGRISCORE  │
       │     ┌─────────────┐  ┌──────────┤  (id: uuid) │
       │     │    PHOTO    │  │  FAVORI  │└─────────────┘
       │     │  (id: uuid) │  │(id: uuid)│
       │     └─────────────┘  └──────────┘
       │
       │         ┌──────────────────┐     ┌─────────────┐
       └────────<│  CONVERSATION    │────<│   MESSAGE   │
          2 FK   │   (id: uuid)     │  1:N│  (id: uuid) │
                 └──────────────────┘     └─────────────┘
```

### Résumé des tables

| Table | PK | Nombre de FK | Contraintes spéciales |
|---|---|---|---|
| `user` | UUID | 0 | Email unique, `USERNAME_FIELD = 'email'` |
| `region` | Integer | 0 | — |
| `province` | Integer | 1 (region) | — |
| `commune` | Integer | 1 (province) | — |
| `parcelle` | UUID | 1 (commune) | Champs PostGIS (PointField, PolygonField) |
| `annonce` | UUID | 2 (parcelle, user) | Slug unique auto-généré |
| `agriscore` | UUID | 1 (parcelle) | **ForeignKey** vers Parcelle (historisation, plusieurs scores possibles) |
| `photo` | UUID | 1 (annonce) | Ordonnée par `ordre` |
| `favori` | UUID | 2 (user, annonce) | **UNIQUE** (user, annonce) |
| `conversation` | UUID | 2 (annonce, initiateur) | **UNIQUE** (annonce, initiateur) — le destinataire est déductible : `annonce.proprietaire` |
| `message` | UUID | 2 (conversation, auteur) | Ordonné par `created_at` |

---

## 5 — Détail des modèles par app

### 5.1 — App `accounts`

#### Modèle `User`

> **Fichier** : `backend/accounts/models.py`
> **Hérite de** : `AbstractUser`
> **Table** : `user`

Utilisateur personnalisé qui remplace le `User` par défaut de Django. L'authentification se fait par **email** (pas de champ `username`).

| Champ | Type Django | Type DB | Contraintes | Description |
|---|---|---|---|---|
| `id` | `UUIDField` | `uuid` | PK, auto-généré | Identifiant unique |
| `email` | `EmailField` | `varchar` | **UNIQUE**, NOT NULL | Adresse email (sert de login) |
| `role` | `CharField(20)` | `varchar(20)` | NOT NULL | Rôle : VENDEUR, ACHETEUR, ADMIN |
| `nom` | `CharField(150)` | `varchar(150)` | NOT NULL | Nom de famille |
| `prenom` | `CharField(150)` | `varchar(150)` | NOT NULL | Prénom |
| `telephone` | `CharField(20)` | `varchar(20)` | NULLABLE | Numéro de téléphone |
| `avatar` | `ImageField` | `varchar` | NULLABLE | Photo de profil (upload → `media/avatars/`) |
| `is_verified` | `BooleanField` | `boolean` | DEFAULT `False` | Compte vérifié par un admin |
| `date_inscription` | `DateTimeField` | `timestamp` | Auto (`auto_now_add`) | Date de création du compte |

> **Note** : Les champs hérités de `AbstractUser` (`password`, `is_active`, `is_staff`, `is_superuser`, `last_login`, `date_joined`, `groups`, `user_permissions`) restent disponibles. Seul `username` a été supprimé.

**Manager Personnalisé (`UserManager`) :**
Étant donné que le champ `username` a été supprimé, un manager personnalisé a été créé pour gérer la création des utilisateurs et superutilisateurs uniquement avec l'email.
```python
objects = UserManager()
```

**Configuration requise dans `settings` :**
```python
AUTH_USER_MODEL = 'accounts.User'
```

---

### 5.2 — App `geo`

> **Fichier** : `backend/geo/models.py`

Hiérarchie administrative du Maroc. Les IDs sont des `IntegerField` (pas auto-incrémentés) car ils proviennent des données officielles du découpage territorial.

#### Modèle `Region`
**Table** : `region`

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `IntegerField` | PK | ID officiel de la région |
| `nom` | `CharField(255)` | NOT NULL | Nom de la région |
| `code` | `CharField(50)` | NOT NULL | Code de la région |

#### Modèle `Province`
**Table** : `province`

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `IntegerField` | PK | ID officiel |
| `region` | `ForeignKey → Region` | NOT NULL, CASCADE | Région parente |
| `nom` | `CharField(255)` | NOT NULL | Nom de la province |
| `code` | `CharField(50)` | NOT NULL | Code de la province |

#### Modèle `Commune`
**Table** : `commune`

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `IntegerField` | PK | ID officiel |
| `province` | `ForeignKey → Province` | NOT NULL, CASCADE | Province parente |
| `nom` | `CharField(255)` | NOT NULL | Nom de la commune |

**Accès depuis Django (exemples) :**
```python
# Toutes les provinces d'une région
region.provinces.all()

# Toutes les communes d'une province
province.communes.all()

# Remonter : commune → province → région
commune.province.region.nom
```

---

### 5.3 — App `annonces`

> **Fichier** : `backend/annonces/models.py`

#### Modèle `Parcelle`
**Table** : `parcelle`

Représente le terrain physique avec ses caractéristiques agricoles et sa géolocalisation.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `UUIDField` | PK, auto | Identifiant unique |
| `commune` | `FK → geo.Commune` | NOT NULL, CASCADE | Localisation administrative |
| `surface_ha` | `DecimalField(8,2)` | NOT NULL | Surface en **hectares** |
| `statut_foncier` | `CharField(20)` | NOT NULL | Voir [enum StatutFoncier](#statut-foncier) |
| `acces_eau` | `CharField(20)` | NOT NULL | Voir [enum AccesEau](#accès-eau) |
| `topographie` | `CharField(20)` | NOT NULL | Voir [enum Topographie](#topographie) |
| `acces_routier` | `CharField(20)` | NOT NULL | Voir [enum AccesRoutier](#accès-routier) |
| `latitude` | `FloatField` | NOT NULL | Coordonnée GPS |
| `longitude` | `FloatField` | NOT NULL | Coordonnée GPS |
| `geom` | `PointField` (PostGIS) | NOT NULL, SRID 4326 | Géométrie point pour requêtes spatiales |
| `metadata` | `JSONField` | DEFAULT `{}` | Données supplémentaires flexibles |
| `created_at` | `DateTimeField` | Auto | Date de création |

> **💡 `geom` vs `latitude`/`longitude`** : Le champ `geom` (PostGIS) permet les requêtes spatiales avancées (distance, intersection, contenu dans une zone). Les champs `latitude`/`longitude` offrent un accès simple aux coordonnées sans avoir besoin de PostGIS.

#### Modèle `DonneesGeo`
**Table** : `donnees_geo`

Représente les données géographiques étendues (contour) d'une parcelle. Relation **OneToOne** avec `Parcelle`.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `UUIDField` | PK, auto | Identifiant unique |
| `parcelle` | `OneToOneField → Parcelle` | NOT NULL, CASCADE | Parcelle associée |
| `contour` | `PolygonField` (PostGIS) | NOT NULL, SRID 4326 | Contour géographique exact |

> **💡 `geom` vs `latitude`/`longitude`** : Le champ `geom` (PostGIS) permet les requêtes spatiales avancées (distance, intersection, contenu dans une zone). Les champs `latitude`/`longitude` offrent un accès simple aux coordonnées sans avoir besoin de PostGIS.

#### Modèle `Annonce`
**Table** : `annonce`

Représente la mise en vente d'une parcelle par un propriétaire.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `UUIDField` | PK, auto | Identifiant unique |
| `parcelle` | `FK → Parcelle` | NOT NULL, CASCADE | Terrain mis en vente |
| `proprietaire` | `FK → User` | NOT NULL, CASCADE | Vendeur |
| `slug` | `SlugField(255)` | **UNIQUE**, auto | URL-friendly (ex: `terrain-irrigue-fes-a1b2c3d4`) |
| `titre` | `CharField(120)` | NOT NULL | Titre de l'annonce |
| `description` | `TextField` | NOT NULL | Description détaillée |
| `prix_mad` | `DecimalField(12,2)` | NOT NULL | Prix en **MAD** (dirhams) |
| `statut` | `CharField(20)` | DEFAULT `brouillon` | Voir [enum StatutAnnonce](#statut-annonce) |
| `loc_confidentielle` | `BooleanField` | DEFAULT `False` | Masquer la localisation exacte |
| `date_publication` | `DateTimeField` | NULLABLE | Date de mise en ligne |
| `created_at` | `DateTimeField` | Auto | Date de création |
| `updated_at` | `DateTimeField` | Auto | Dernière modification |

#### Modèle `StatistiqueAnnonce`
**Table** : `statistique_annonce`

Compteurs de vues journaliers d'une annonce. La combinaison `(annonce, date)` est unique.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `UUIDField` | PK, auto | Identifiant unique |
| `annonce` | `FK → Annonce` | NOT NULL, CASCADE | Annonce concernée |
| `date` | `DateField` | NOT NULL | Date de la statistique |
| `vues` | `PositiveIntegerField` | DEFAULT `0` | Nombre de vues ce jour-là |

**Génération automatique du slug :**
```python
def save(self, *args, **kwargs):
    if not self.slug:
        base_slug = slugify(self.titre)
        self.slug = f"{base_slug}-{str(self.id)[:8]}"
    super().save(*args, **kwargs)
```
Le slug est composé du titre slugifié + les 8 premiers caractères de l'UUID, garantissant l'unicité.

#### Modèle `AgriScore`
**Table** : `agriscore`

Score de qualité agricole calculé automatiquement pour chaque parcelle. Relation **ForeignKey** : une parcelle peut avoir plusieurs AgriScores (historisation), le plus récent est le score courant.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `UUIDField` | PK, auto | Identifiant unique |
| `parcelle` | `ForeignKey → Parcelle` | NOT NULL, CASCADE | Parcelle évaluée |
| `score_global` | `FloatField` | NULLABLE | Score global (0–100) |
| `sous_scores` | `JSONField` | NULLABLE | Détail par critère (ex: `{"sol": 85, "eau": 72}`) |
| `indice_confiance` | `FloatField` | NULLABLE | Fiabilité du score (0–1) |
| `version_ponderation` | `CharField(50)` | NOT NULL | Version de la pondération de scoring |
| `calculated_at` | `DateTimeField` | NULLABLE | Date du dernier calcul |

#### Modèle `Photo`
**Table** : `photo`

Photos associées à une annonce. Ordonnées par le champ `ordre`.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `UUIDField` | PK, auto | Identifiant unique |
| `annonce` | `FK → Annonce` | NOT NULL, CASCADE | Annonce associée |
| `image` | `ImageField` | NOT NULL | Fichier image (upload → `media/photos/`) |
| `ordre` | `IntegerField` | DEFAULT `0` | Ordre d'affichage (0 = principale) |
| `created_at` | `DateTimeField` | Auto | Date d'upload |

> **💡 Photo principale** : La photo avec `ordre = 0` est considérée comme la photo principale. L'ordre est unique par annonce.

---

### 5.4 — App `messaging`

> **Fichier** : `backend/messaging/models.py`

#### Modèle `Favori`
**Table** : `favori`

Permet à un utilisateur de sauvegarder une annonce. La contrainte d'unicité empêche de mettre la même annonce en favori deux fois.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `UUIDField` | PK, auto | Identifiant unique |
| `user` | `FK → User` | NOT NULL, CASCADE | Utilisateur |
| `annonce` | `FK → Annonce` | NOT NULL, CASCADE | Annonce sauvegardée |
| `created_at` | `DateTimeField` | Auto | Date d'ajout |

> **Contrainte** : `UNIQUE (user, annonce)` — Un utilisateur ne peut pas ajouter la même annonce en favori deux fois.

#### Modèle `Conversation`
**Table** : `conversation`

Fil de discussion entre un utilisateur (initiateur) et le vendeur d'une annonce. Le destinataire est déductible : `conversation.annonce.proprietaire`.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `UUIDField` | PK, auto | Identifiant unique |
| `annonce` | `FK → Annonce` | NOT NULL, CASCADE | Annonce concernée |
| `initiateur` | `FK → User` | NOT NULL, CASCADE | Qui a démarré la conversation |
| `created_at` | `DateTimeField` | Auto | Date de création |
| `updated_at` | `DateTimeField` | Auto | Dernière activité |

> **Contrainte** : `UNIQUE (annonce, initiateur)` — Une seule conversation par combinaison annonce + initiateur.

#### Modèle `Message`
**Table** : `message`

Messages individuels dans une conversation. Ordonnés chronologiquement.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `UUIDField` | PK, auto | Identifiant unique |
| `conversation` | `FK → Conversation` | NOT NULL, CASCADE | Conversation parente |
| `auteur` | `FK → User` | NOT NULL, CASCADE | Expéditeur du message |
| `contenu` | `TextField` | NOT NULL | Corps du message |
| `is_lu` | `BooleanField` | DEFAULT `False` | Message lu par le destinataire |
| `created_at` | `DateTimeField` | Auto | Date d'envoi |

---

## 6 — Relations entre les modèles

### Relations FK (ForeignKey) — 1:N

| Parent | Enfant | related_name | on_delete |
|---|---|---|---|
| `Region` | `Province` | `provinces` | CASCADE |
| `Province` | `Commune` | `communes` | CASCADE |
| `Commune` | `Parcelle` | `parcelles` | CASCADE |
| `Parcelle` | `Annonce` | `annonces` | CASCADE |
| `User` | `Annonce` | `annonces` | CASCADE |
| `Parcelle` | `AgriScore` | `scores` | CASCADE |
| `Annonce` | `Photo` | `photos` | CASCADE |
| `User` | `Favori` | `favoris` | CASCADE |
| `Annonce` | `Favori` | `favoris` | CASCADE |
| `Annonce` | `Conversation` | `conversations` | CASCADE |
| `User` | `Conversation` (initiateur) | `conversations_initiees` | CASCADE |
| `Conversation` | `Message` | `messages` | CASCADE |
| `User` | `Message` | `messages_envoyes` | CASCADE |

### Relations OneToOne — 1:1

| Parent | Enfant | related_name |
|---|---|---|
| `Parcelle` | `DonneesGeo` | `donnees_geo` |

> **Note** : `AgriScore` est désormais une **ForeignKey** (historisation, `related_name='scores'`), pas un OneToOne.

### Exemples d'accès via le ORM Django

```python
# Toutes les annonces d'un propriétaire
user.annonces.all()

# Le dernier AgriScore d'une parcelle (historisé)
parcelle.scores.order_by('-created_at').first()

# Les photos d'une annonce
annonce.photos.all()

# Les favoris d'un utilisateur
user.favoris.select_related('annonce').all()

# Les conversations initiées par un utilisateur
user.conversations_initiees.all()

# Le destinataire d'une conversation (déductible)
conversation.annonce.proprietaire

# Les messages d'une conversation
conversation.messages.order_by('created_at')

# Les parcelles d'une commune
commune.parcelles.filter(acces_eau='irriguee')

# Requête spatiale : parcelles dans un rayon de 10 km
from django.contrib.gis.measure import D
from django.contrib.gis.geos import Point
point = Point(-5.0, 34.0, srid=4326)
Parcelle.objects.filter(geom__distance_lte=(point, D(km=10)))
```

---

## 7 — Enums & choix prédéfinis

### Statut foncier
*Modèle : `Parcelle.StatutFoncier`*

| Valeur DB | Label | Description |
|---|---|---|
| `melkia` | Melkia | Propriété privée pleine |
| `soulaliya` | Soulaliya | Terre collective tribale |
| `guich` | Guich | Terre concédée par l'État |
| `habous` | Habous | Bien de mainmorte (fondation religieuse) |
| `immatricule` | Immatriculé | Terrain enregistré au cadastre |

### Accès eau
*Modèle : `Parcelle.AccesEau`*

| Valeur DB | Label | Description |
|---|---|---|
| `irriguee` | Irriguée | Accès à un système d'irrigation |
| `bour` | Bour | Agriculture pluviale uniquement |
| `mixte` | Mixte | Combinaison des deux |

### Topographie
*Modèle : `Parcelle.Topographie`*

| Valeur DB | Label | Description |
|---|---|---|
| `plat` | Plat | Terrain plat |
| `pentu` | Pentu | Terrain en pente |
| `vallonne` | Vallonné | Terrain avec des ondulations |

### Accès routier
*Modèle : `Parcelle.AccesRoutier`*

| Valeur DB | Label | Description |
|---|---|---|
| `goudron` | Goudron | Route goudronnée |
| `piste` | Piste | Piste non goudronnée |
| `difficile` | Difficile | Accès difficile |

### Statut annonce
*Modèle : `Annonce.StatutAnnonce`*

| Valeur DB | Label | Description |
|---|---|---|
| `brouillon` | Brouillon | En cours de rédaction |
| `en_attente` | En attente | Soumise, en attente de validation |
| `en_ligne` | En ligne | Publiée et visible |
| `archivee` | Archivée | Retirée par le propriétaire |
| `vendue` | Vendue | Transaction finalisée |

### Rôle utilisateur
*Modèle : `User.Role`*

| Valeur DB | Label | Description |
|---|---|---|
| `VENDEUR` | Vendeur | Possède des terrains à vendre |
| `ACHETEUR` | Acheteur | Cherche des terrains à acheter |
| `ADMIN` | Administrateur | Gère la plateforme |

---

## 8 — Configuration & prérequis

### Variables d'environnement (`.env`)

```env
SECRET_KEY=votre-cle-secrete-ici
DATABASE_URL=postgis://user:password@localhost:5432/akal_db
```

> ⚠️ Le schéma de la `DATABASE_URL` doit être `postgis://` (pas `postgres://`) pour que GeoDjango fonctionne.

### Settings clés (`akal/settings/base.py`)

```python
# Utiliser le User custom
AUTH_USER_MODEL = 'accounts.User'

# Activer GeoDjango
INSTALLED_APPS = [
    ...
    'django.contrib.gis',
    'accounts',
    'geo',
    'annonces',
    'messaging',
]

# Engine PostGIS
DATABASES['default']['ENGINE'] = 'django.contrib.gis.db.backends.postgis'

# Chemins des bibliothèques GDAL/GEOS (Windows PostgreSQL 18)
GDAL_LIBRARY_PATH = r'C:\Program Files\PostgreSQL\18\bin\libgdal-35.dll'
GEOS_LIBRARY_PATH = r'C:\Program Files\PostgreSQL\18\bin\libgeos_c.dll'

# Fichiers uploadés
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'
```

### Commandes de mise en route

```powershell
# 1. Créer le virtualenv (à la racine de backend)
cd backend
python -m venv akal_env

# 2. Installer les dépendances Python (utilise le venv !)
akal_env\scripts\python.exe -m pip install -r requirements.txt

# 3. Activer PostGIS dans PostgreSQL
psql -d akal_db -c "CREATE EXTENSION postgis;"

# 4. Créer les migrations
akal_env\scripts\python.exe manage.py makemigrations accounts geo annonces messaging --settings=akal.settings.dev

# 5. Appliquer les migrations
akal_env\scripts\python.exe manage.py migrate --settings=akal.settings.dev

# 6. Créer un superutilisateur
akal_env\scripts\python.exe manage.py createsuperuser --settings=akal.settings.dev
```

> ⚠️ **Important** : Toujours installer les dépendances dans le **virtualenv** `akal_env`, jamais dans le Python système. Vérifiez que le venv est activé (le prompt affiche `(akal_env)`) avant de lancer `pip install`.

### Comptes par défaut (Développement)

Un superutilisateur a été créé par défaut pour accéder à l'interface d'administration Django :

| Rôle | Email | Mot de passe |
|---|---|---|
| Admin | `admin@akal.ma` | `admin1234` |

---

## 9 — Management Commands

Commandes personnalisées Django disponibles dans le projet.

### 9.1 — `seed_parcelles`

> **App** : `annonces`
> **Fichier** : `backend/annonces/management/commands/seed_parcelles.py`

Insère **18 parcelles agricoles fictives** réalistes pour le développement et les tests.

**Utilisation :**
```bash
# Lancer le seed complet
python manage.py seed_parcelles

# Nettoyer les données seed sans recréer
python manage.py seed_parcelles --clear
```

**Ce que fait la commande :**

| Étape | Action | Détail |
|---|---|---|
| 1. Nettoyage | Supprime les données seed existantes | Parcelles, annonces, photos, AgriScores liés aux utilisateurs de test |
| 2. Géo | Crée les données géographiques | 6 régions, 12 provinces, 13 communes (`get_or_create`) |
| 3. Utilisateurs | Crée 2 vendeurs de test | `vendeur1@akal.ma` et `vendeur2@akal.ma` |
| 4. Données | Crée 18 parcelles + annonces | Avec photos (2-3 par annonce) et AgriScores |

**Dépendances requises :**
```bash
pip install Faker requests Pillow
```

**Utilisateurs de test créés :**

| Email | Nom | Rôle | Mot de passe |
|---|---|---|---|
| `vendeur1@akal.ma` | Ahmed El Fassi | VENDEUR | `test1234` |
| `vendeur2@akal.ma` | Fatima Benkirane | VENDEUR | `test1234` |

**Gestion des images :**
- Les images sont téléchargées depuis **Picsum** (`picsum.photos`)
- Elles sont cachées dans `media/seed_images/` pour éviter de re-télécharger
- En cas d'échec réseau, un **placeholder** est généré avec Pillow
- Les photos sont sauvegardées dans `media/photos/` via l'ImageField Django

**Données culturales :**
Le type de culture est stocké dans le champ `metadata` (JSONField) de la Parcelle :
```python
# Exemple
parcelle.metadata  # {'culture': ['Blé', 'Olivier']}
```

**Résultats attendus :**
- 18 parcelles dans la table `parcelle`
- 18 annonces (statut `en_ligne`) dans la table `annonce`
- ~42 photos dans la table `photo` + fichiers dans `media/photos/`
- 18 AgriScores dans la table `agriscore`
- 2 utilisateurs de test

---

### 9.2 — `seed_test_data`

> **App** : `annonces`
> **Fichier** : `backend/annonces/management/commands/seed_test_data.py`

Génère **100 000 annonces** de test pour le benchmarking de performance et les tests de charge.

**Utilisation :**
```powershell
# Lancer le seed complet (100K par défaut)
# Note: Sur Windows PowerShell, utiliser le flag -X utf8 pour éviter les erreurs d'encodage (UnicodeEncodeError) avec les emojis.
akal_env\scripts\python.exe -X utf8 manage.py seed_test_data --settings=akal.settings.dev

# Nombre personnalisé
akal_env\scripts\python.exe -X utf8 manage.py seed_test_data --count 50000 --settings=akal.settings.dev

# Nettoyer les données de test
akal_env\scripts\python.exe -X utf8 manage.py seed_test_data --clear --settings=akal.settings.dev
```

**Ce que fait la commande :**

| Étape | Action | Détail |
|---|---|---|
| 1. Géo | Crée les données géographiques | 6 régions, 12 provinces, 13 communes (`get_or_create`) |
| 2. Utilisateurs | Crée 5 utilisateurs de test | `loadtest1@akal.ma` à `loadtest5@akal.ma` |
| 3. Parcelles | Génère N parcelles (`bulk_create`) | Points PostGIS valides (bounding box Maroc), cultures aléatoires, lots de 5 000 |
| 4. Annonces | Génère N annonces 1:1 (`bulk_create`) | Statut `en_ligne`, prix 50K–5M MAD, lots de 5 000 |

**Optimisations :**
- `bulk_create(batch_size=5000)` pour minimiser les allers-retours SQL
- Génération de `Point(lon, lat, srid=4326)` PostGIS valides dans le bounding box du Maroc (lat: 27.6–35.9, lon: -13.2–-1.0)
- `metadata.culture` contient une liste de 1 à 3 cultures aléatoires

**Utilisateurs de test créés :**

| Email | Nom | Rôle | Mot de passe |
|---|---|---|---|
| `loadtest1@akal.ma` | Youssef Bencherki | VENDEUR | `loadtest2026` |
| `loadtest2@akal.ma` | Khadija Amrani | VENDEUR | `loadtest2026` |
| `loadtest3@akal.ma` | Omar Tazi | VENDEUR | `loadtest2026` |
| `loadtest4@akal.ma` | Salma Berrada | VENDEUR | `loadtest2026` |
| `loadtest5@akal.ma` | Mehdi Idrissi | VENDEUR | `loadtest2026` |

---

## 10 — Logique Métier & Vues

La logique backend est organisée en **3 couches modulaires** :

| Couche | Fichier | Responsabilité |
|---|---|---|
| **Manager** | `annonces/managers.py` | QuerySet réutilisable (filtres de base, optimisation SQL) |
| **FilterSet** | `annonces/filters.py` | Filtres à facettes déclaratifs (`django-filter`) |
| **View** | `annonces/views.py` | Orchestration (pagination, contexte) |

---

### 10.1 — AnnonceManager & AnnonceQuerySet

> **Fichier** : `backend/annonces/managers.py`

Manager custom attaché au modèle `Annonce` (`objects = AnnonceManager()`). Expose des méthodes chainables via `AnnonceQuerySet` :

| Méthode | Retour | Description |
|---|---|---|
| `en_ligne()` | `QuerySet` | Filtre `statut='en_ligne'` |
| `with_relations()` | `QuerySet` | Applique `select_related` + `prefetch_related` (voir ci-dessous) |
| `search(query)` | `QuerySet` | `Q(titre__icontains=q) \| Q(description__icontains=q)` |

**Optimisation N+1 — `with_relations()` :**

| Stratégie | Relations chargées | Justification |
|---|---|---|
| `select_related` (JOIN) | `parcelle`, `parcelle__commune`, `parcelle__commune__province`, `parcelle__commune__province__region`, `proprietaire` | FK simples → 1 seule requête SQL |
| `prefetch_related` (cache) | `photos` | Relation inverse 1:N → requête séparée mise en cache |

**Exemples d'utilisation :**
```python
# Annonces publiées, relations pré-chargées
Annonce.objects.en_ligne().with_relations()

# Recherche textuelle chainée
Annonce.objects.en_ligne().search("irrigué")

# Combinaison complète
Annonce.objects.en_ligne().search("Fès").with_relations()
```

---

### 10.2 — AnnonceFilter (django-filter) — LEGACY (vues HTML)

> **Fichier** : `backend/annonces/filters.py`
> **Dépendance** : `django-filter>=25.1` (ajouté dans `requirements.txt` et `INSTALLED_APPS`)
> **⚠️ LEGACY** : Ce FilterSet est utilisé uniquement par les vues HTML de rétrocompatibilité. Le FilterSet de l'API REST est `AnnonceAPIFilter` (dans `api_views.py`).

FilterSet déclaratif qui centralise toute la logique de filtrage à facettes pour les vues template. Chaque paramètre GET est validé et converti automatiquement avant d'atteindre l'ORM.

#### Paramètres GET supportés

| Paramètre | Type de filtre | Champ ORM | Exemple d'URL |
|---|---|---|---|
| `q` | Recherche textuelle (méthode custom, `Q objects`) | `titre`, `description` | `?q=terrain irrigué` |
| `region` | `BaseInFilter` (multi-sélection) | `parcelle__commune__province__region_id` | `?region=1&region=3` |
| `statut_foncier` | `BaseInFilter` (multi-sélection) | `parcelle__statut_foncier` | `?statut_foncier=melkia&statut_foncier=guich` |
| `acces_eau` | `ChoiceFilter` (exact) | `parcelle__acces_eau` | `?acces_eau=irriguee` |
| `prix_min` | `NumberFilter` (`gte`) | `prix_mad` | `?prix_min=100000` |
| `prix_max` | `NumberFilter` (`lte`) | `prix_mad` | `?prix_max=500000` |
| `surface_min` | `NumberFilter` (`gte`) | `parcelle__surface_ha` | `?surface_min=2` |
| `surface_max` | `NumberFilter` (`lte`) | `parcelle__surface_ha` | `?surface_max=50` |
| `sort` | `OrderingFilter` | — | `?sort=prix_mad`, `?sort=-prix_mad`, `?sort=date_publication`, `?sort=-date_publication` |

#### Méthodes custom

| Méthode | Paramètre | Logique |
|---|---|---|
| `filter_search` | `q` | `Q(titre__icontains=value) \| Q(description__icontains=value)` |

---

### 10.3 — CatalogueView

> **Fichier** : `backend/annonces/views.py`
> **Route** : `/annonces/`
> **Hérite de** : `django_filters.views.FilterView`

Vue catalogue simplifiée qui délègue le filtrage et le tri au `AnnonceFilter`.

**Architecture :**
```
Requête GET → FilterView
                ├── get_queryset() → Annonce.objects.en_ligne().with_relations()
                ├── AnnonceFilter.filter_queryset() → applique tous les filtres
                ├── paginate_queryset() → pagination 12/page
                └── get_context_data() → injecte active_filters + current_sort
```

**Caractéristiques :**
*   **Filtrage** : Entièrement délégué à `AnnonceFilter` (déclaratif, validé).
*   **Pagination** : 12 éléments/page. Gestion robuste des erreurs (`PageNotAnInteger` → page 1, `EmptyPage` → dernière page).
*   **Contexte front-end (Persistance UI)** : La méthode `get_context_data` utilise la validation du FilterSet (`filterset.form.cleaned_data`) pour nettoyer et extraire uniquement les paramètres GET valides. Cela permet de rejeter avec grâce les erreurs de typage dans l'URL (ex: `prix_min=abc`) et d'injecter proprement `active_filters` et `current_sort` dans le contexte pour pré-remplir les formulaires UI.
*   **Optimisation SQL** : Via `AnnonceManager.with_relations()` dans `get_queryset()`.

---

### 10.4 — AnnonceDetailView

> **Fichier** : `backend/annonces/views.py`
> **Route** : `/annonces/<slug:slug>/`
> **Hérite de** : `django.views.generic.DetailView`

Vue détaillée affichant la fiche complète d'une annonce et incluant un système de recommandation.

**Caractéristiques principales :**
*   **Optimisation N+1** : Surcharge de `get_queryset()` pour inclure `Annonce.objects.en_ligne().with_relations()` afin de charger en une seule requête le propriétaire, la chaîne géographique, et les photos. La relation OneToOne `parcelle__agriscore` y est également pré-chargée via un `select_related` dédié.
*   **Algorithme de recommandation** : Injecte dans le contexte un queryset `parcelles_similaires` (jusqu'à 3 annonces).
    *   *Critères* : Prix situé dans une fourchette de +/- 20% **ET** (même région **OU** même type de culture).
    *   *Optimisation* : Ce queryset utilise également `.with_relations()` pour éviter tout problème N+1 lors de l'affichage des cartes de suggestion sur le frontend. L'annonce actuellement consultée est automatiquement exclue des résultats.

---

## 11 — API REST (DRF) & Swagger

L'API REST est développée avec **Django REST Framework (DRF)** et documentée avec **drf-spectacular** (OpenAPI 3), conformément au contrat d'intégration frontend/backend (§4).

### 11.1 — drf-spectacular (Swagger UI)

L'API est auto-documentée. En environnement de développement, l'interface Swagger UI est accessible pour tester les endpoints :

*   **URL Swagger UI** : `http://localhost:8000/api/schema/swagger-ui/`
*   **Schéma brut (YAML/JSON)** : `http://localhost:8000/api/schema/`

### 11.2 — Endpoints de l'API

Toutes les routes API sont préfixées par `/api/`.

#### `GET /api/annonces/` (Catalogue)

Liste allégée des annonces (statut `en_ligne`), paginée et filtrable.

*   **Pagination** : 12 résultats par page (max 50).
*   **Réponse type** :
    ```json
    {
      "count": 142,
      "next": "http://localhost:8000/api/annonces/?page=2",
      "previous": null,
      "results": [
        {
          "id": "uuid",
          "slug": "terrain-irrigue-fes-1234abcd",
          "titre": "Terrain irrigué Fès",
          "prix_mad": "450000.00",
          "statut": "en_ligne",
          "score_courant": {"score_global": 82.5},
          "photo_principale": "http://localhost:8000/media/photos/photo_0.jpg",
          "created_at": "2026-07-10T14:30:00Z",
          "parcelle": {
            "id": "uuid",
            "surface_ha": "12.50",
            "statut_foncier": "melkia",
            "acces_eau": "irriguee",
            "region": {"code": "fes-meknes", "nom": "Fès-Meknès"},
            "localisation": {"latitude": 34.05, "longitude": -5.0}
          }
        }
      ]
    }
    ```
*   **Filtres supportés** (`?param=value`) : `region` (code slug, ex: `?region=fes-meknes`), `statut_foncier`, `acces_eau`, `prix_min`, `prix_max`, `surface_min`, `surface_max`.
*   **Tri supporté** (`?ordering=`) : `date_publication`, `prix_mad`, `surface_ha`. (Préfixer par `-` pour décroissant).

#### `GET /api/annonces/<slug>/` (Détail Annonce)

Fiche complète d'une annonce spécifique.

*   **Réponse type** :
    ```json
    {
      "id": "uuid",
      "slug": "terrain-irrigue-fes-1234abcd",
      "titre": "Terrain irrigué Fès",
      "description": "...",
      "prix_mad": "450000.00",
      "statut": "en_ligne",
      "loc_confidentielle": false,
      "date_publication": "2026-07-10T14:30:00Z",
      "created_at": "2026-07-10T14:30:00Z",
      "updated_at": "2026-07-10T14:30:00Z",
      "parcelle": {
        "id": "uuid",
        "surface_ha": "12.50",
        "statut_foncier": "melkia",
        "acces_eau": "irriguee",
        "topographie": "plat",
        "acces_routier": "goudron",
        "metadata": {"culture": ["Blé", "Olivier"]},
        "region": {"code": "fes-meknes", "nom": "Fès-Meknès"},
        "province": "Fès",
        "commune": "Fès Médina",
        "localisation": {
          "latitude": 34.05,
          "longitude": -5.0,
          "adresse_approximative": "Fès Médina, Maroc"
        }
      },
      "photos": [
        {"id": "uuid", "image": "http://.../photo_0.jpg", "ordre": 0},
        {"id": "uuid", "image": "http://.../photo_1.jpg", "ordre": 1}
      ],
      "score_courant": {
        "score_global": 82.5,
        "sous_scores": {"sol": 85, "eau": 90},
        "indice_confiance": 0.85,
        "version_ponderation": "v1.0",
        "calculated_at": "2026-07-10T14:30:00Z"
      },
      "proprietaire": {
        "id": "a1b2c3d4-e5f6-..."
      },
      "photo_principale": "http://.../photo_0.jpg"
    }
    ```

#### `GET /api/geo/regions/` (Référentiel Géo)

Liste des régions du Maroc (non paginé).

*   **Réponse type** :
    ```json
    [
      {"id": 1, "code": "fes-meknes", "nom": "Fès-Meknès"},
      {"id": 2, "code": "marrakech-safi", "nom": "Marrakech-Safi"}
    ]
    ```

---

## 12 — CORS

Le backend est configuré pour accepter les requêtes Cross-Origin Resource Sharing (CORS) provenant du frontend Next.js.

*   **Package** : `django-cors-headers`
*   **Développement (`dev.py`)** : `CORS_ALLOW_ALL_ORIGINS = True` (permet les appels depuis n'importe quelle source locale, ex: `http://localhost:3000`).
*   **Production (`base.py` / `prod.py`)** : Seuls les domaines spécifiques (ex: le domaine final du frontend) seront autorisés via `CORS_ALLOWED_ORIGINS`.

---

## 13 — Cache Redis & Performance

Le backend utilise **Redis** comme cache via `django-redis` pour atteindre des temps de réponse < 20ms sur les requêtes de catalogue filtrées.

### Infrastructure

> **Fichier** : `backend/docker-compose.yml`

Un service Redis 7 Alpine est provisionné via Docker Compose :
```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
```

### Configuration (`base.py`)

```python
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': env('REDIS_URL', default='redis://127.0.0.1:6379/1'),
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        },
        'KEY_PREFIX': 'akal',
        'TIMEOUT': 60,
    }
}
```

La variable `REDIS_URL` peut être définie dans `.env` pour surcharger l'URL par défaut.

### Stratégies de cache appliquées

| Vue | Stratégie | TTL | Clé de cache |
|---|---|---|---|
| `CatalogueView` | Cache manuel (response HTTP) | 60s | `catalogue:` + MD5 des query params triés |
| `AnnonceDetailView` | `@cache_page(300)` | 5 min | Clé Django standard (URL-based) |

**CatalogueView** — Le cache manuel est préféré à `@cache_page` car il permet de construire des clés granulaires basées sur les filtres actifs, maximisant le hit rate :
```python
def _build_catalogue_cache_key(query_dict):
    sorted_params = sorted(query_dict.items())
    raw = '&'.join(f'{k}={v}' for k, v in sorted_params)
    return f"catalogue:{hashlib.md5(raw.encode()).hexdigest()}"
```

**AnnonceDetailView** — `@method_decorator(cache_page(300), name='dispatch')` appliqué sur toute la vue. Les détails d'annonce changent rarement, un TTL plus long est approprié.

---

## 12 — Test de Charge (Locust)

Un script de test de charge est fourni pour valider les objectifs de performance (réponse < 20ms).

> **Fichier** : `backend/locustfile.py`

### Scénarios simulés

| Classe | Poids | Comportement |
|---|---|---|
| `CatalogueBrowser` | 3 | Requêtes filtrées aléatoires sur `/annonces/` (region, statut_foncier, culture, acces_eau, prix, surface, sort) + recherche textuelle |
| `DetailViewer` | 1 | Découverte de slugs via le catalogue puis consultation de `/annonces/<slug>/` |

### Filtres aléatoires appliqués

Chaque requête du `CatalogueBrowser` combine aléatoirement 1 à 4 filtres parmi :
- `region` → `[1, 2, 3, 4, 5, 6]`
- `statut_foncier` → `['melkia', 'soulaliya', 'guich', 'habous', 'immatricule']`
- `culture` → `['Blé', 'Olivier', 'Arganier', 'Maraîchage', 'Agrumes', ...]`
- `acces_eau` → `['irriguee', 'bour', 'mixte']`
- `prix_min` / `prix_max` → fourchettes aléatoires
- `sort` → `['prix', '-prix', 'date_publication', '-date_publication']`

### Exécution du test de charge

```powershell
# 1) Lancer Redis
cd backend
docker compose up -d redis

# 2) Seeder 100K annonces
akal_env\scripts\python.exe -X utf8 manage.py seed_test_data --settings=akal.settings.dev

# 3) Lancer le serveur Django
# Note : -X utf8 est recommandé sur Windows pour éviter les UnicodeDecodeError avec les caractères spéciaux dans les URLs (ex: Fès, Blé)
akal_env\scripts\python.exe -X utf8 manage.py runserver --settings=akal.settings.dev

# 4) Lancer Locust (dans un second terminal, toujours depuis le dossier backend)
akal_env\scripts\python.exe -m locust -f locustfile.py --host=http://127.0.0.1:8000
```

Puis ouvrir **http://localhost:8089** pour configurer le nombre d'utilisateurs virtuels et lancer le test.

---

## 13 — Déploiement en Production (Docker & IaC)

Le backend AKAL est conteneurisé via Docker et configuré pour un déploiement Infrastructure as Code (IaC) sur [Render](https://render.com).

### Composants de production

| Composant | Technologie | Fichier de config | Rôle |
|---|---|---|---|
| **Conteneurisation** | Docker | `Dockerfile` | Image `python:3.11-slim` sécurisée (utilisateur non-root). Installe les dépendances système GDAL/PostGIS via `apt-get` (`binutils`, `libproj-dev`, `gdal-bin`). |
| **Orchestration / IaC** | Render | `render.yaml` | Déploie un Web Service Docker (`akal-backend`) et provisionne une DB PostgreSQL managée (`akal-db`). Gère l'injection de `DATABASE_URL` et `SECRET_KEY`. |
| **Serveur d'Application** | Gunicorn | `requirements.txt` | Serveur WSGI performant pour Django (`gunicorn akal.wsgi:application --bind 0.0.0.0:8000`). |
| **Fichiers Statiques** | WhiteNoise | `base.py` | Middleware (`WhiteNoiseMiddleware`) servant les assets statiques sans nécessiter un serveur Nginx/Apache en frontal. |

> ⚠️ **PostGIS sur Render** : La base de données provisionnée par `render.yaml` est un PostgreSQL standard. Lors du premier déploiement, vous devez exécuter manuellement `CREATE EXTENSION postgis;` sur l'instance de DB avant que les migrations Django ne puissent s'exécuter avec succès.

---

## 14 — Journal des modifications

| Date | Auteur | Description |
|---|---|---|
| 2026-06-26 | — | **Création initiale** : Intégration du schéma complet (13 modèles, 4 apps). User custom, PostGIS, enums fonciers marocains. |
| 2026-06-26 | — | **Configuration base de données** : Installation PostGIS, configuration chemins GDAL/GEOS, création `UserManager`, application des migrations, et création du superutilisateur. |
| 2026-06-29 | — | **Seed parcelles** : Management command `seed_parcelles` — 18 parcelles fictives avec photos Picsum, 2 vendeurs de test, données géo, AgriScores. Renommage `DATABASE.md` → `BACKEND.md`. |
| 2026-06-29 | — | **Vue Catalogue & Pagination** : Création de `CatalogueView` (12/page) avec optimisation SQL (select/prefetch_related). Routage `/annonces/`. |
| 2026-06-29 | — | **Filtres ORM & Tri** : Ajout de filtres avancés (prix, surface, région, culture dans JSONField) et système de tri (`?sort=`) dans `CatalogueView`. |
| 2026-06-30 | — | **Refactoring filtres modulaires** : Architecture 3 couches (Manager → FilterSet → View). Création `managers.py` (AnnonceQuerySet chainable), `filters.py` (django-filter avec recherche Q, BaseInFilter multi-sélection, OrderingFilter). Migration de `ListView` vers `FilterView`. Ajout `django-filter>=25.1`. |
| 2026-06-30 | — | **Validation du contexte UI** : Amélioration de `CatalogueView.get_context_data` pour utiliser `filterset.form.cleaned_data` afin d'ignorer silencieusement les erreurs de typage URL et d'injecter des `active_filters` stricts au frontend. |
| 2026-06-30 | — | **Vue Détail & Recommandations** : Création de `AnnonceDetailView` avec optimisation N+1 (`with_relations()`, `agriscore`). Ajout d'un algorithme de parcelles similaires basé sur le prix (+/- 20%) et (Région ou Culture) via requêtes `Q`. |
| 2026-06-30 | — | **Config DevOps (Prod)** : Ajout du `Dockerfile` (PostGIS deps, Gunicorn, non-root), `.dockerignore` et `render.yaml`. Configuration de `WhiteNoise` pour les statiques. Ajout d'une condition dans `base.py` pour basculer dynamiquement le `GDAL_LIBRARY_PATH` entre Windows et Linux/Docker. |
| 2026-07-03 | — | **Cache Redis & Test de charge** : Ajout `docker-compose.yml` (Redis 7 Alpine), configuration `CACHES` django-redis dans `base.py`, cache manuel sur `CatalogueView` (60s, clé MD5) et `@cache_page(300)` sur `AnnonceDetailView`. Création `seed_test_data.py` (100K annonces, `bulk_create` x5000, Points PostGIS Maroc). Création `locustfile.py` (2 profils : CatalogueBrowser + DetailViewer avec filtres aléatoires). |
| 2026-07-13 | — | **API v2 (Intégration Frontend)** : Implémentation du contrat d'API (§4 Amélioration). I-1 : Corrections du schéma (DonneesGeo, suppression vues/contour/is_principale, ajout StatistiqueAnnonce). I-2 : Installation et config DRF, drf-spectacular (Swagger) et django-cors-headers. I-3 : Création des serializers et vues API REST (`/api/annonces/`, `/api/geo/regions/`) conformes. I-4 : Commande `seed_demo` pour générer ~15 annonces de démo complètes. |
| 2026-07-14 | — | **Correctifs contrat v1.1 → v1.2 (T1–T11)** : T1 — RGPD `ProprietaireSerializer` expose UUID uniquement. T2 — Sous-objet `parcelle` dans la liste (interdiction d'aplatir). T3 — Renommages modèle (`prix`→`prix_mad`, `statut_annonce`→`statut`, `surface`→`surface_ha`). T4 — `OrderingFilter` django-filter avec mapping contrat (`prix_mad`, `surface_ha`, `date_publication`). T5 — Filtre `region` par code slug + sérialisation `{code, nom}`. T6 — Sous-objet `localisation` (avec `adresse_approximative` en détail). T7 — Retrait FK `destinataire` sur `Conversation` (déductible via `annonce.proprietaire`). T8 — AgriScore historisé (OneToOne→FK, `version_algo`→`version_ponderation`). T9 — Retrait `type_culture` (décision PO). T10 — Commentaire LEGACY sur `AnnonceFilter`. T11 — Codes région en slug kebab-case dans `seed_demo`. |
---

*Documentation générée et maintenue au fur et à mesure de l'avancement du projet AKAL.*
