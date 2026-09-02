# AKAL — Contrat de données
**Version :** 1.3 — Septembre 2026 *(passeport AgriScore à la demande + comptage de vues — voir changelog)*
**Statut :** À relire par Ibrahim (PR), puis soumis à validation académique (échéance explicite, silence vaut accord sous 5 jours ouvrés)
**Parties :** Back-end Django/DRF (producteur — Ibrahim) · Front-end Next.js (consommateur — Mégane) · Pipeline d'enrichissement AgriScore (producteur secondaire — Ibrahim)

**Changelog v1.2 → v1.3 :**
- **Pipeline AgriScore refondu** — nouvelle app Django `agriscore/`. Le score n'est plus stocké par parcelle : il est calculé **à la demande** par `GET /api/parcelles/<id>/passeport/` (§4.8), qui interroge 5 dimensions (sol, climat, NDVI, topographie, accès) auprès de sources externes réelles, avec cache Redis par agent. §3.5 (modèle `annonces.AgriScore`) et `score_courant` dans le DTO annonce sont **supersédés** : conservés nullable pour compat, non alimentés — retrait à réévaluer.
- **Comptage de vues de fiche** — `POST /api/annonces/<id>/vue/` (§4.9), beacon anonyme émis par le front au montage de la fiche, alimente `StatistiqueAnnonce.vues` (§3.4, jusque-là dormant). Nouveaux champs de sortie : `nb_vues` sur `GET /api/annonces/mes-annonces/`, `vues_totales` / `vues_30j` sur `GET /api/annonces/mes-annonces/statistiques/`.
- Le contrat interne §5 (`PATCH /api/internal/parcelles/<id>/metadata/`) n'est **pas** utilisé par le pipeline AgriScore actuel (calcul autonome, sans écriture en base hors cache). Il reste réservé à un futur enrichissement `metadata`.

**Changelog v1.1 → v1.2 :**
- Retrait de `type_culture` (§3.1, §4.2, §4.4, §6.1) — **changement cassant**, gouvernance §7. Justification : le champ n'a jamais été migré en enum fermée côté back (reste porté par `metadata.culture`, JSON libre non fiabilisé) et le front a tranché indépendamment de ne pas l'exposer en filtre ni en affichage catalogue — donnée jugée relever du conseil agronomique plutôt que d'un fait stable et vérifié à ce stade. Hors périmètre J1 tant qu'aucun des deux constats n'est levé.

**Changelog v1.0 → v1.1 :**
- Format d'erreurs : abandon du format custom au profit du format natif DRF (coût/bénéfice)
- `agriscore` explicitement nullable + comportement front défini
- Médias : bucket MinIO public en lecture tranché (vs URLs pré-signées)
- Query params de filtrage détaillés (`page_size` max 50, `ordering`)
- Convention d'URL `/api/geo/regions/<code>/communes/` réservée pour MT4
- Propriétaire anonymisé dans les DTO publics (RGPD / loi 09-08)
- ~~`type_culture` en enum fermée confirmée côté API~~ — retiré en v1.2, jamais effectivement implémenté

---

## 1. Objet et portée

Ce contrat fixe **la structure, la sémantique et les règles d'échange des données** entre les composants d'AKAL. Il fait autorité sur :

1. Le schéma des entités métier (source de vérité : modèles Django, base PostgreSQL/PostGIS unique du monolithe modulaire) ;
2. Le contrat de l'API REST publique consommée par le front (périmètre v1 : **lecture**, jalon J1) ;
3. Le contrat de l'endpoint interne consommé par le pipeline Prefect.

**Documentation vivante :** le schéma OpenAPI généré par drf-spectacular (`/api/schema/swagger-ui/`, JSON brut sur `/api/schema/`) fait foi en cas de divergence après implémentation ; ce document est alors mis à jour, jamais l'inverse silencieusement.

Toute divergence constatée entre ce contrat et l'implémentation est remontée **par écrit** (issue GitHub, label `api-mismatch`), jamais à l'oral.

---

## 2. Conventions transverses

| Sujet | Règle |
|---|---|
| Nommage | Charte de nommage AKAL v1 — métier FR, technique EN, `snake_case` partout côté API. Si le front veut du camelCase en interne, la conversion se fait côté front (`mapAnnonceToParcelle()`), jamais imposée au back |
| Identifiants | **UUID v4 exposés à l'API** ; les PK entières restent internes (anti-énumération du catalogue et des comptes) |
| Dates | ISO 8601 UTC — `2026-07-13T14:30:00Z` |
| Monnaie | MAD implicite, entier — champ `prix_mad`. Pas de champ `devise` (multi-devise hors scope) |
| Surfaces | Hectares implicites, decimal(10,2) — champ `surface_ha`. Pas de champ `unite_surface` |
| Géométries | SRID 4326 (WGS 84), GeoJSON à l'API |
| Encodage | UTF-8 partout (Tifinagh et arabe inclus) |
| Tableaux | Toujours `[]` si vide, jamais `null` (simplifie le rendu front) |
| Base URL | Variable d'environnement front (`NEXT_PUBLIC_API_URL`), jamais en dur. Dev local : `http://localhost:8000/api/` |
| Format d'échange | JSON uniquement (`Content-Type: application/json`) |
| Nullabilité | Explicite champ par champ ; tout champ non marqué nullable est requis |

---

## 3. Schéma des entités

> Ce schéma intègre les **correctifs pré-migrations** (étape 0.5 — Ibrahim, feature branch, pas de merge sans validation) : correction de la contrainte CONVERSATION, AgriScore en OneToMany, isolation des géométries lourdes, ordre photos unifié, extraction du compteur `vues`.

### 3.1 Parcelle — le bien foncier lui-même
La séparation Parcelle / Annonce est structurante : AgriScore et l'enrichissement géospatial décrivent **la terre**, pas l'annonce. C'est ce qui permet l'historique de prix par parcelle (futur jeu d'entraînement ML). **Cette séparation est préservée dans les DTO API** (sous-objet `parcelle`), jamais aplatie.

| Champ | Type | Contraintes | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `titre` | varchar(100) | requis | |
| `region` / `province` / `commune` | FK référentiel geo | requis | Sélecteur en cascade |
| `latitude` / `longitude` | decimal | requis | Point de référence léger |
| `surface_ha` | decimal(10,2) | requis, > 0 | |
| `statut_foncier` | varchar (choices) | requis | `melkia`, `soulaliya`, `guich`, `habous`, `immatricule` |
| `acces_eau` | varchar (choices) | requis | `irriguee`, `bour`, `mixte` |
| `topographie` | varchar (choices) | optionnel | |
| `metadata` | JSONField | `default=dict` | Réservé enrichissement Phase 3 (NDVI, sol, pluviométrie) — clés snake_case |
| `created_at` / `updated_at` | datetime | auto | |

### 3.2 DonneesGeo — géométries lourdes isolées
| Champ | Type | Contraintes | Notes |
|---|---|---|---|
| `parcelle` | OneToOne → Parcelle | requis | |
| `contour` | PolygonField (PostGIS) | optionnel | Retiré de PARCELLE — **jamais sérialisé dans les endpoints liste**, servi uniquement sur le détail à la demande |

### 3.3 Annonce — la mise en marché
| Champ | Type | Contraintes | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `slug` | slug | unique, requis | Clé d'accès API détail — ex. `parcelle-5ha-berrechid-agrumes` |
| `parcelle` | FK → Parcelle | requis | Plusieurs annonces possibles dans le temps pour une même parcelle |
| `vendeur` | FK → User | requis | Jamais exposé nominativement (voir §4.5) |
| `titre` | varchar(50) | requis | |
| `description` | text(500) | requis | |
| `prix_mad` | integer | requis, > 0 | |
| `statut` | varchar (choices) | requis | `en_attente`, `en_ligne`, `archivee`, `vendue` — vocabulaire unique partagé avec le dashboard propriétaire |
| `date_publication` | datetime | nullable | Renseigné au passage `en_ligne` |
| `created_at` / `updated_at` | datetime | auto | `updated_at` ne reflète que les modifications éditoriales |

### 3.4 StatistiqueAnnonce — compteurs extraits
| Champ | Type | Notes |
|---|---|---|
| `annonce` | FK → Annonce | Le compteur `vues` est sorti d'ANNONCE : il polluait `updated_at` et interdisait l'analyse temporelle |
| `date` | date | Une ligne par jour → séries temporelles pour le dashboard propriétaire |
| `vues` | integer | Alimenté depuis le 2026-08-31 par `POST /api/annonces/<id>/vue/` (§4.9). Une vue par (annonce, jour, lecteur) : le beacon front est dédupliqué 24 h côté serveur |

### 3.5 AgriScore — ~~historisé~~ *(supersédé v1.3 — voir §4.8)*

> ⚠️ **Supersédé en septembre 2026.** Le score n'est plus stocké par parcelle.
> L'app `agriscore/` calcule un « passeport » **à la demande** via
> `GET /api/parcelles/<id>/passeport/` (§4.8) — 5 dimensions collectées auprès
> de sources externes réelles, agrégées à la volée, mises en cache Redis par
> agent (pas en table). Le seul état persisté est un drapeau de configuration
> singleton (`agriscore.ConfigurationAgriScore.actif`, éditable en admin :
> décoché ⇒ passeport simulé, zéro appel externe).
>
> Le modèle `annonces.AgriScore` ci-dessous et le champ `score_courant` du DTO
> annonce (§4.4) sont **conservés nullable pour compatibilité mais non
> alimentés** ; leur retrait est à réévaluer.

| Champ | Type | Contraintes | Notes |
|---|---|---|---|
| `parcelle` | FK → Parcelle | requis | *(legacy)* |
| `score_global` | integer 0–100 | requis | *(legacy)* |
| `sous_scores` | JSONField | requis | *(legacy — clés jamais finalisées)* |
| `version_ponderation` | varchar | requis | *(legacy)* |
| `created_at` | datetime | auto | *(legacy)* |

**Règle DTO annonce (inchangée) :** `score_courant` est **nullable côté API** ;
`null` aujourd'hui pour toutes les annonces (plus rien ne l'alimente). Le front
affiche « Score en cours de calcul » — jamais d'erreur, jamais de 0 trompeur.
Le vrai potentiel agronomique passe par le passeport (§4.8).

### 3.6 Photo
| Champ | Type | Contraintes | Notes |
|---|---|---|---|
| `annonce` | FK → Annonce | requis | |
| `image` | ImageField | requis | Stockage objet (MinIO en prod via django-storages) — jamais en base |
| `ordre` | integer | requis, unique par annonce, commence à 0 | **`ordre` est la source de vérité unique. La photo principale = `ordre 0`. Aucun champ `is_principale` / `is_cover`** (double logique conflictuelle, supprimée au correctif schéma n°5) |

### 3.7 Conversation / Message
| Champ | Type | Contraintes | Notes |
|---|---|---|---|
| `annonce` | FK → Annonce | requis | |
| `initiateur` | FK → User | requis | |
| — | contrainte | `UNIQUE(annonce, initiateur)` → `uniq_conversation_annonce_initiateur` | `destinataire_id` retiré : le destinataire est déductible (vendeur de l'annonce), l'inclure permettait des doublons |

Message : `conversation` (FK), `auteur` (FK User), `contenu` (text), `is_lu` (bool), `created_at`.

### 3.8 User / Favori
- User custom : rôle `proprietaire` / `investisseur`, email unique vérifié.
- Favori : `UNIQUE(user, annonce)` → `uniq_favori_user_annonce`.

---

## 4. Contrat API REST (front ↔ back) — périmètre v1 : lecture

Authentification : **hors périmètre v1** (endpoints de lecture publics). Avenant v1.1 pour l'écriture (auth JWT httpOnly, favoris, dépôt, messagerie) — le front travaille sur mocks (`NEXT_PUBLIC_USE_MOCKS`) en attendant.

### 4.1 Endpoints

| Méthode | URL | Retour |
|---|---|---|
| GET | `/api/annonces/` | Liste paginée, filtres en query params |
| GET | `/api/annonces/<slug>/` | Détail complet (annonce + parcelle + photos + score courant). `404` si slug inconnu |
| POST | `/api/annonces/<id>/vue/` | Enregistre une vue de fiche (beacon anonyme). `204` systématique. Voir §4.9 |
| GET | `/api/parcelles/<id>/passeport/` | Passeport AgriScore d'une parcelle, calculé à la demande. `404` parcelle inconnue, `422` non géolocalisée. Voir §4.8 |
| GET | `/api/geo/regions/` | Référentiel régions — **non paginé** (référentiel fixe) : `[{ "code": "casablanca-settat", "nom": "Casablanca-Settat" }, …]` |
| — | `/api/geo/regions/<code>/communes/` | **Convention d'URL réservée**, non implémentée en v1. La cartographie MT4/GIO en aura besoin ; on fixe la convention maintenant pour ne pas la casser plus tard |

> Endpoints d'écriture / espace perso (avenant v1.1, hors tableau ci-dessus) :
> `GET /api/annonces/mes-annonces/` porte désormais `nb_vues` (total cumulé des
> vues de la fiche) par annonce ; `GET /api/annonces/mes-annonces/statistiques/`
> porte `vues_totales` et `vues_30j` (30 jours glissants), en plus de
> `favoris_recus` / `conversations_recues` / `messages_non_lus`.

### 4.2 Query params de `/api/annonces/`

| Param | Type | Exemple | Description |
|---|---|---|---|
| `page` | int | `?page=2` | Numéro de page |
| `page_size` | int | `?page_size=20` | Défaut **12** (grille catalogue), **max 50** borné côté back (anti-abus) |
| `region` | slug | `?region=casablanca-settat` | Filtre par code région |
| `statut_foncier` | enum | `?statut_foncier=melkia` | |
| `acces_eau` | enum | `?acces_eau=irriguee` | |
| `prix_min` / `prix_max` | int | `?prix_min=100000` | En MAD |
| `surface_min` / `surface_max` | decimal | `?surface_min=1` | En hectares |
| `ordering` | string | `?ordering=-date_publication` | Champs autorisés : `date_publication`, `prix_mad`, `surface_ha` — préfixe `-` pour desc |

### 4.3 Pagination — DRF `PageNumberPagination` standard

```json
{
  "count": 132,
  "next": "http://localhost:8000/api/annonces/?page=3",
  "previous": "http://localhost:8000/api/annonces/?page=1",
  "results": []
}
```

Justification : comportement par défaut de DRF (zéro code back), `next`/`previous` en URLs absolues prêtes à l'emploi (zéro recalcul front), documenté nativement par drf-spectacular.

### 4.4 Structure JSON d'une annonce

```json
{
  "id": "3f2b6c9e-8a41-4d2c-9f1e-7b5a2c8d4e10",
  "slug": "parcelle-5ha-berrechid-agrumes",
  "titre": "Parcelle agricole 5 ha — Berrechid",
  "description": "Terrain agricole irrigué, exposition sud…",
  "prix_mad": 450000,
  "statut": "en_ligne",
  "date_publication": "2026-06-01T09:30:00Z",
  "parcelle": {
    "id": "a1c4e7f0-2b5d-4e8a-b3c6-d9f2a5b8c1e4",
    "surface_ha": 5.00,
    "statut_foncier": "melkia",
    "acces_eau": "irriguee",
    "region": { "code": "casablanca-settat", "nom": "Casablanca-Settat" },
    "localisation": {
      "latitude": 33.2653,
      "longitude": -7.5878,
      "adresse_approximative": "Berrechid, Maroc"
    }
  },
  "score_courant": {
    "score_global": 78,
    "sous_scores": {
      "fertilite": 82,
      "situation_hydrique": 70,
      "accessibilite": 75,
      "situation_juridique": 80,
      "potentiel_valorisation": 76
    },
    "version_ponderation": "v1.0"
  },
  "photos": [
    {
      "id": "b2d5f8a1-3c6e-4f9b-a4d7-e0a3b6c9d2f5",
      "url": "https://media.akal.ma/annonces/3f2b6c9e/photo-0.webp",
      "ordre": 0
    }
  ],
  "proprietaire": { "id": "c3e6a9b2-4d7f-4a0c-b5e8-f1b4c7d0e3a6" },
  "created_at": "2026-05-28T14:12:00Z",
  "updated_at": "2026-06-01T09:30:00Z"
}
```

**Règles de sérialisation :**
- Le sous-objet `parcelle` est **toujours présent** — jamais aplati dans l'annonce (la séparation Parcelle/Annonce est la décision architecturale porteuse du dataset ML).
- La version **liste** est un sous-ensemble allégé : `id`, `slug`, `titre`, `prix_mad`, `statut`, `parcelle` (sans `localisation.adresse_approximative`), `score_courant.score_global` seul, `photo_principale` (URL de la photo `ordre 0`), `created_at`.
- `score_courant` : `null` si aucun score calculé → le front affiche « Score en cours », jamais d'erreur.
- `photos` : toujours un tableau trié par `ordre` croissant, `[]` si vide.
- Le contour PostGIS (`DonneesGeo`) n'apparaît **ni en liste ni en détail v1** — endpoint dédié futur si besoin carto.

### 4.5 Exposition du propriétaire (RGPD / loi 09-08)
Le DTO public n'expose **jamais** le nom réel, l'email ou le téléphone du vendeur — uniquement son UUID. L'identité n'est révélée qu'après mise en relation via la messagerie (hors périmètre v1). Usage standard des marketplaces + minimisation des données conforme au plan directeur (MT6/SIO).

### 4.6 Format des erreurs — natif DRF, sans surcouche

Erreur simple (404) :
```json
{ "detail": "Annonce introuvable." }
```

Erreur de validation par champ (400, futurs endpoints d'écriture) :
```json
{ "prix_mad": ["Ce champ doit être un nombre positif."] }
```

Justification : zéro travail back (comportement natif DRF), documenté automatiquement par drf-spectacular, cas d'erreur métier riches rares en v1 lecture. Côté front, la lecture d'erreur est centralisée dans un unique helper de `lib/api.ts` (`detail` pour les erreurs simples, clés de champ pour les 400).

**Codes HTTP (lecture v1) :** `200` succès · `400` paramètres invalides · `404` ressource introuvable · `500` erreur serveur.

### 4.7 URLs médias — piège MinIO/`/media` tranché

**Décision : URLs absolues + bucket MinIO public en lecture.**

1. `MEDIA_URL` pointe vers l'endpoint public MinIO (ou un CDN devant), **jamais** vers le domaine de l'API Django.
2. Chaque URL reçue est directement utilisable dans `<img src>` — **le front ne concatène jamais de préfixe**.
3. Bucket **public en lecture** plutôt que pré-signé : les photos d'annonces sont publiques par nature, les URLs stables permettent le cache navigateur/CDN et le SSR Next.js sans expiration. Les documents sensibles futurs (CIN, titres fonciers — F16) iront dans un bucket privé pré-signé distinct, hors périmètre v1.

### 4.8 Passeport AgriScore — `GET /api/parcelles/<id>/passeport/`

Évaluation agronomique d'une **parcelle** (pas d'une annonce), calculée à la
demande. Public (`AllowAny`, aucune authentification), throttlé (scope `passeport`,
40/h) : un appel non caché déclenche jusqu'à 5 requêtes vers des API externes
(Copernicus, Open-Meteo, SoilGrids, OSRM) — le cache Redis par agent rend les
appels répétés (même parcelle, parcelles voisines) quasi gratuits.

`<id>` = **UUID de la Parcelle** (`parcelle.id` du DTO annonce, §4.4), pas
l'UUID de l'annonce.

**Codes :** `200` succès · `404` parcelle inconnue · `422` parcelle non
géolocalisée (`{ "detail": "Parcelle non géolocalisée : passeport indisponible." }`).

La réponse ne contient **jamais** les coordonnées de la parcelle : l'endpoint
est public et le vrai UUID de parcelle est déjà exposé par `/api/annonces/<slug>/`
— les renvoyer ici contournerait le floutage de localisation d'une annonce
confidentielle (§4.4). Le front a déjà les coordonnées (floutées si besoin) via
le DTO annonce.

```json
{
  "parcelle_id": "a1c4e7f0-2b5d-4e8a-b3c6-d9f2a5b8c1e4",
  "genere_le": "2026-09-02T11:20:00Z",
  "mode": "reel",
  "score_global": 68.9,
  "fiabilite_globale": 80.0,
  "dimensions": {
    "sol":    { "statut": "ok", "mode": "reel", "sous_score": 84.4, "confiance": 0.7,
                "valeurs": { "ph_eau": 7.7, "type_sol": "argileux" },
                "source": "SoilGrids v2.0 (ISRIC)", "date_collecte": "2026-09-02T11:20:00Z",
                "resolution_m": 250, "zone_tampon_m": 100,
                "poids_nominal": 20, "poids_effectif_renormalise": 21.3, "contribution": 17.9 },
    "climat": { "…": "…" },
    "ndvi":   { "…": "…" },
    "topo":   { "…": "…" },
    "acces":  { "…": "…" }
  },
  "dimensions_indisponibles": [],
  "cultures_suggerees": [
    { "culture": "olivier", "statut": "compatible", "raison": "…", "reserve": "sous vérification terrain" }
  ],
  "avertissement": ""
}
```

**Sémantique :**

- `mode` : `"reel"` / `"simule"` / `"mixte"` — nature des sources qui ont
  **réellement abouti** (résultats `statut="ok"`), pas des agents sollicités.
  `"simule"` ⇒ drapeau `ConfigurationAgriScore.actif` décoché (démo hors ligne).
- `score_global` : `null` si **aucune** dimension exploitable. Sinon moyenne
  pondérée /100 sur les seules dimensions disponibles (les poids sont
  renormalisés). `fiabilite_globale` : 0–100 %.
- `dimensions` : dict à 5 clés fixes (`sol`, `climat`, `ndvi`, `topo`, `acces`),
  ordre stable. Chaque bloc porte `statut` (`ok` / `indisponible`), `sous_score`
  (`null` si indisponible), `confiance` (0–1), `valeurs` (**dict libre, clés
  snake_case — le front itère dynamiquement, ne type jamais ces clés en dur**),
  et la traçabilité (`source`, `resolution_m`, `date_collecte`, poids).
- `dimensions_indisponibles` : liste ordonnée des dimensions en échec (`[]` si
  passeport complet).
- `avertissement` : chaîne (vide si `mode == "reel"` et rien d'indisponible).
  Concatène le rappel « données simulées » et/ou « Passeport partiel : <libellés>
  indisponible(s)… ».
- `cultures_suggerees` : toujours produit (même si `score_global` est `null`) —
  `statut ∈ {compatible, sous_condition, deconseille}`, `reserve` = « sous
  vérification terrain ».

### 4.9 Comptage de vues — `POST /api/annonces/<id>/vue/`

Beacon anonyme émis par le front au montage de `/parcelles/<slug>` (la fiche
étant en SSG, un comptage côté `GET` ne verrait que les fetch de build).

- `authentication_classes = []` (endpoint volontairement anonyme, pas de CSRF) ;
  throttlé (scope `vue`, 120/h). Corps et en-têtes vides → requête CORS
  « simple », pas de préflight.
- **`204` systématique** (comptée ou dédupliquée) — ne révèle pas si l'IP a déjà
  vu la fiche. `404` si l'annonce n'est pas publique (`en_ligne` + dataset actif).
- Déduplication 24 h côté serveur par `(annonce, sha256(IP + User-Agent + jour))`
  dans le cache — ni l'IP ni l'UA ne sont stockés. Le front déduplique aussi
  localement (localStorage, 6 h) pour éviter les requêtes inutiles.
- L'exclusion du propriétaire de son propre comptage se fait **côté front**
  (la fiche connaît `estProprietaire`).

---

## 5. Contrat interne pipeline (Prefect ↔ back)

| Sujet | Règle |
|---|---|
| Endpoint | `PATCH /api/internal/parcelles/<id>/metadata/` |
| Auth | Token de service dédié, jamais le token d'un utilisateur |
| Payload | Fusion partielle du JSONField `metadata` — clés snake_case : `ndvi_moyen`, `type_sol`, `pluviometrie_mm`, `date_enrichissement` |
| Idempotence | Rejouer le même enrichissement ne crée aucun doublon ni effet de bord |
| Interdiction | Le pipeline n'écrit **jamais** directement en base : toujours via l'endpoint interne |

---

## 6. Règles de qualité des données

1. Une annonce ne passe `en_ligne` que si : parcelle géolocalisée, ≥ 1 photo, prix > 0.
2. Aucun champ métier libre là où une enum existe (`statut_foncier`, `acces_eau`, `statut`).
3. Les données scrapées (R-04) entrent avec un flag `source = "scraping"` et ne sont jamais mélangées silencieusement aux dépôts propriétaires.
4. Suppression d'une annonce = archivage logique (`statut = archivee`), jamais de DELETE physique tant que des conversations y sont rattachées.

---

## 7. Gouvernance et versioning

- **Sources de vérité :** ce document (intention) + le schéma OpenAPI généré (implémentation). En cas de conflit après implémentation, le Swagger gagne et ce document est mis à jour par PR.
- **Modification :** PR sur ce fichier, revue croisée obligatoire (Mégane + Ibrahim). Changement cassant (suppression/renommage de champ, changement de type) → incrément de version majeure et préavis d'un sprint.
- **Validation académique :** soumis à M. Baroud avec échéance explicite ; sans réponse sous 5 jours ouvrés, le contrat est réputé validé (consentement tracé, conforme au protocole du plan directeur).

### Prochaines étapes
1. Ibrahim relit et amende ce document (PR, commentaires ou édition directe).
2. Ibrahim applique les correctifs schéma §3 sur feature branch (étape 0.5) + pose drf-spectacular.
3. Validation croisée : comparaison Swagger généré ↔ ce document, correction des écarts.
4. Merge dans `docs/AKAL_Contrat_Donnees_v1.2.md` + envoi à M. Baroud avec échéance.
