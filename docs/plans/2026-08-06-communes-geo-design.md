# Import shapefile communes/provinces du Maroc — design

Date: 2026-08-06
Branche prévue : `feat/communes-geo`

## Contexte

Demande initiale : importer un Shapefile des communes du Maroc
(`Commune_Maroc.shp/.shx/.dbf/.prj/.qpj`, ~/Downloads/Commune Maroc/) dans
PostgreSQL/PostGIS, modèle Django, API DRF GeoJSON, filtrage province → région,
intégration aux formulaires de dépôt et de recherche d'annonce.

L'app `geo` existante (`backend/geo/models.py`) porte un référentiel
`Region`/`Province`/`Commune` **non géométrique et minuscule** : jeu de démo
saisi à la main, 6 régions sur 12, 12 provinces, 13 communes, `Commune` sans
champ `code`. Utilisé comme FK par `Parcelle.commune` dans tout le flux dépôt
d'annonce/catalogue depuis F03.

## Vérifications effectuées avant conception (faits, pas suppositions)

Inspection réelle des fichiers via GDAL/ogrinfo, pas de confiance aveugle
dans les métadonnées ou la documentation des sources :

- **Shapefile communes** : 1536 polygones, CRS = Lambert Conformal Conic
  marocain (Merchich/Nord Maroc — ellipsoïde Clarke 1880 IGN, paramètres
  confirmés exacts via le `.prj`, pas de code EPSG embarqué mais la
  transformation se fait sur le WKT exact, pas besoin de deviner un EPSG).
  Attributs : `LIBELLE` (nom brut majuscule, préfixé `CR `/`MU ` = Commune
  Rurale/Municipalité) et `REGION` (numérique 1-12, code HCP officiel — 2
  colonnes seulement, **aucun code commune, aucune province**). 2 géométries
  auto-intersectées, 2 multipolygones, ~260 482 sommets au total.
- **Shapefile provinces** (trouvé après recherche, source
  [sig-maroc.com](https://sig-maroc.com/donnees/shapefiles), licence
  ODbL/attribution requise) : téléchargé et vérifié indépendamment (pas fait
  confiance au site) — 75 provinces/préfectures (le vrai compte), **déjà en
  WGS84/EPSG:4326**, 0 géométrie invalide, champ `ISO` (`MA-03-131`) dont le
  segment médian est le code région officiel 1-12. Recoupement confirmé entre
  les deux fichiers, indépendamment l'un de l'autre : région 3 = Fès-Meknès
  dans les deux sources.
- **Douars** : recherchés (HCP RGPH 2014). Uniquement des statistiques
  tabulaires (XLSX/DOCX : codes, noms, données socio-éco) — **aucune
  géométrie officielle disponible en open data**. Reporté à une évolution
  ultérieure (décision utilisateur).
- Mapping région officiel 1-12 dérivé des données réelles (provinces
  regroupées par code région), pas de la mémoire :
  1 Tanger-Tétouan-Al Hoceïma, 2 L'Oriental, 3 Fès-Meknès, 4
  Rabat-Salé-Kénitra, 5 Béni Mellal-Khénifra, 6 Casablanca-Settat, 7
  Marrakech-Safi, 8 Drâa-Tafilalet, 9 Souss-Massa, 10 Guelmim-Oued Noun, 11
  Laâyoune-Sakia El Hamra, 12 Dakhla-Oued Ed-Dahab.

## Périmètre — cette semaine

✅ Régions officielles (12, codes HCP) · ✅ Provinces (shapefile vérifié) ·
✅ Communes (shapefile) · ✅ Hiérarchie complète Région → Province → Commune ·
✅ Sélection géographique dans le formulaire de dépôt · ✅ Publication basée
sur `commune_geom` · ⏳ Douars reportés · ⏳ Filtres catalogue Province/Commune
reportés (Région seule cette semaine — ajouter Province/Commune au filtre
catalogue est une extension de contrat API à part entière) · ⏳ Simplification
de géométrie pour l'affichage carte (pas bloquant, le filtre région/province
borne déjà la charge).

## Décision structurante : additif, jamais destructif

`geo.Region`/`Province`/`Commune` **ne sont pas touchés** — les 13 communes de
démo et les `Parcelle` réelles (dont données UAT d'autres testeurs) qui les
référencent restent intactes. Tout le nouveau référentiel vit dans des
modèles séparés. `Parcelle.commune` (legacy) n'est jamais migré ni
rétro-rempli par correspondance de nom — un essai initial dans cette
direction (`get_or_create(nom=..., province=None)`) s'est avéré à la fois
risqué (doublons possibles, deux communes homonymes dans des provinces
différentes) et cassé techniquement (`Commune.province` n'est pas nullable,
`Commune.id` n'a pas de valeur par défaut). Abandonné au profit d'un nouveau
champ `Parcelle.commune_geom`, appuyé sur une vraie jointure spatiale plutôt
que sur une correspondance de nom.

## Modèles (app `geo`)

```python
class RegionOfficielle(models.Model):
    code = models.PositiveSmallIntegerField(primary_key=True)  # 1-12, HCP
    slug = models.SlugField(unique=True)   # "fes-meknes" — même convention que Region.code
    nom = models.CharField(max_length=100)

    class Meta:
        constraints = [
            models.CheckConstraint(check=models.Q(code__gte=1, code__lte=12), name='region_code_1_12'),
        ]


class ProvinceGeom(models.Model):
    iso = models.CharField(max_length=20, unique=True)   # "MA-03-131"
    nom = models.CharField(max_length=150)
    nom_ar = models.CharField(max_length=150, blank=True)
    region = models.ForeignKey(RegionOfficielle, on_delete=models.PROTECT, related_name='provinces')
    geom = gis_models.MultiPolygonField(srid=4326)  # index GiST automatique (GeoDjango, spatial_index=True par défaut)


class CommuneGeom(models.Model):
    source_fid = models.PositiveIntegerField(unique=True)  # index de feature du shapefile — clé d'idempotence
    libelle = models.CharField(max_length=100)              # brut, ex "CR IMLILI"
    nom_affichage = models.CharField(max_length=100, db_index=True)  # nettoyé, ex "Imlili"
    type_commune = models.CharField(max_length=2, choices=[('CR', 'Rurale'), ('MU', 'Urbaine')])
    province = models.ForeignKey(ProvinceGeom, on_delete=models.PROTECT, related_name='communes')
    geom = gis_models.MultiPolygonField(srid=4326)
```

**Pas de champ `region` sur `CommuneGeom`** — dérivable via `province.region`.
Décision revue en cours de conception : la redondance n'était pas justifiée
par la performance (ce que j'aurais accepté comme seule justification), donc
supprimée — mais en durcissant la résolution de `province` en conséquence
(voir plus bas) plutôt qu'en acceptant silencieusement des communes sans
classification.

`province` est **non-nullable** ici : la commande d'import doit résoudre
*toutes* les communes ou échouer explicitement (voir Import). Pas de
`province=NULL` en base — soit résolu, soit l'import s'arrête et liste les
cas en échec.

### `Parcelle` (app `annonces`)

```python
commune_geom = models.ForeignKey('geo.CommuneGeom', on_delete=models.SET_NULL, null=True, blank=True, related_name='parcelles')
```

`Parcelle.is_geolocated()` teste désormais `self.commune_geom_id is not None`
(remplace `self.commune_id is not None`). `commune` (legacy) reste sur le
modèle, jamais retiré, mais n'est plus lu par la logique de publication.

## Import — commande de gestion `import_geo_officiel`

Idempotente (`update_or_create` sur clé naturelle stable : `code` pour
`RegionOfficielle`, `iso` pour `ProvinceGeom`, `source_fid` pour
`CommuneGeom` — un nom n'est pas une clé fiable, `LIBELLE` n'est pas garanti
unique au niveau national), transaction unique (`transaction.atomic()` —
aucun état partiel possible), flag `--dry-run` (rapport sans écriture).

1. `RegionOfficielle` : seed en dur des 12 lignes (vérifiées par recoupement
   réel entre les deux shapefiles, cf. plus haut).
2. `ProvinceGeom` : lecture directe (déjà en 4326), promotion `Polygon` →
   `MultiPolygon` si besoin.
3. `CommuneGeom` : reprojection Lambert marocain → 4326
   (`GEOSGeometry.transform()`, SRID source = WKT exact du `.prj`, pas un
   EPSG deviné). Résolution de `province` en cascade :
   `ST_Within(centroïde, province.geom)` → `ST_Intersects(centroïde, ...)`
   (cas frontière exacte) → plus proche province par distance avec tolérance
   bornée (quelques centaines de mètres — écart plausible entre deux sources
   indépendantes). Si aucune des trois ne résout : la commune est ajoutée à
   une liste d'échecs.
4. Si la liste d'échecs n'est pas vide en fin de run : `CommandError`,
   rollback complet, la liste des communes concernées (libellé + coordonnées
   du centroïde) est affichée pour investigation manuelle — jamais de
   `province` deviné ou laissé `NULL` en silence.
5. Géométries invalides détectées (2 connues, auto-intersections) :
   réparées via `.buffer(0)` **uniquement ici**, sur de la donnée officielle
   importée en masse — politique délibérément différente du rejet strict
   appliqué au contour dessiné à la main par un utilisateur (feature dessin
   de parcelle) : la source et le niveau de confiance ne sont pas les mêmes.
6. `LIBELLE` ne matchant pas `^(CR|MU) ` : compté et loggé plutôt que
   silencieusement mal découpé en `type_commune`/`nom_affichage`.

### Validations ajoutées (retour utilisateur : cohérence + spatiale)

- **Cohérence** : le code région du shapefile communes (`REGION`, source
  directe) est comparé à `province.region.code` (déduit de la jointure
  spatiale) pour chaque commune importée — tout désaccord entre les deux
  sources indépendantes est loggé (pas bloquant en soi, mais visible) plutôt
  que silencieusement ignoré puisqu'on n'a plus de champ `region` séparé sur
  `CommuneGeom` pour porter cette info après coup.
- **Comptage** : le rapport final vérifie les totaux attendus (12 régions, 75
  provinces, 1536 communes) et signale tout écart.
- **Spatiale** : `ST_IsValid()` sur chaque géométrie après import (pas
  seulement les 2 cas connus — filet de sécurité si le fichier changeait) ;
  bornes de superficie grossières (alerte si une commune fait moins de
  quelques centaines de m² ou plus qu'une région entière — géométrie
  probablement corrompue) ; centroïdes vérifiés dans l'emprise du Maroc
  (lat ≈ 21-36, lon ≈ -17 à -1) — même classe de garde-fou que le problème
  « parcelle dans l'océan » identifié en tout début de cette collaboration
  (inversion lon/lat), appliqué ici à l'import en masse plutôt qu'à la saisie
  utilisateur.

## API DRF / GeoJSON

Nouveau préfixe `/api/geo/limites/` (vocabulaire « limites administratives »,
repris de la source — pas de collision avec `/api/geo/regions|provinces|
communes/` legacy, qui restent en service tels quels) :

```
GET /api/geo/limites/regions/                    → JSON simple [{code, slug, nom}], 12 lignes, non paginé
GET /api/geo/limites/provinces/?region=<slug>     → GeoJSON FeatureCollection — region obligatoire (400 sinon)
GET /api/geo/limites/communes/?province=<id>      → GeoJSON FeatureCollection
GET /api/geo/limites/communes/?region=<slug>      → idem, toutes les communes de la région
```

Lecture seule (`AllowAny`), pas de pagination. `communes/` exige au moins un
des deux filtres — jamais de dump national non borné (260k sommets).

Ajout de `djangorestframework-gis` (absent du projet jusqu'ici — cf. audit du
tout début de cette collaboration sur le format GeoJSON) : `GeoFeatureModelSerializer`
produit du `Feature`/`FeatureCollection` conforme RFC 7946 nativement.

```python
class CommuneGeomSerializer(GeoFeatureModelSerializer):
    province = ProvinceResumeSerializer(read_only=True)  # {id, nom}, pas la géométrie imbriquée
    region = serializers.SerializerMethodField()          # commune.province.region — plus de champ dupliqué

    class Meta:
        model = CommuneGeom
        geo_field = 'geom'
        fields = ['id', 'nom_affichage', 'type_commune', 'province', 'region']
```

## Intégration frontend

### Dépôt d'annonce (`EtapeLocalisation.tsx`)

Cascade Région/Province/Commune re-sourcée sur `/api/geo/limites/...`
(nouvelles fonctions dans `lib/geo-api.ts`, dé-enveloppent
`.features[].properties` des `FeatureCollection`). État :
`regionSlug`/`provinceId`/`communeGeomId`. Le hidden input `commune` est
remplacé par `commune_geom` — pas de tentative de rétro-remplissage de
l'ancien champ.

### Backend — effet de bord sur la lecture publique (à ne pas oublier)

Les serializers de lecture (`ParcelleListSerializer`/`ParcelleDetailSerializer.
get_region()`, `province`/`commune` actuellement en `CharField(source=...)`)
ne lisent que l'ancienne chaîne — sans changement, une annonce utilisant
`commune_geom` afficherait région/province/commune vides sur sa fiche
publique. Passage en `SerializerMethodField()`, priorité `commune_geom` →
repli sur `commune` legacy (préserve l'affichage des 22 annonces déjà
publiées). `RegionOfficielle` exposé publiquement sous la même forme
`{code, nom}` que l'ancien `geo.Region` (le `code` public = le `slug`, pas le
code HCP numérique interne) — zéro changement de contrat côté frontend pour
ce sous-objet.

`AnnonceAPIFilter.region` (filtre catalogue) passe d'un `field_name=` direct
à une méthode couvrant les deux chaînes :

```python
def filter_region(self, queryset, name, value):
    return queryset.filter(
        Q(parcelle__commune__province__region__code=value) |
        Q(parcelle__commune_geom__province__region__slug=value)
    )
```

### Recherche catalogue (`FiltresSidebar`)

Sélecteur Région basculé sur `/api/geo/limites/regions/` (12 régions réelles
au lieu de 6). Filtres Province/Commune **non ajoutés cette semaine** (scope
gardé raisonnable — extension de contrat API à traiter séparément si voulue).

## Tests prévus

- **Import** : idempotence (run deux fois, aucun doublon), taux de résolution
  province (échec bruyant si incomplet), réparation des 2 géométries
  invalides connues, cohérence région shapefile vs région déduite, bornes
  spatiales (emprise Maroc), comptages (12/75/1536).
- **API** : forme `FeatureCollection` correcte, 400 si `communes/` sans
  filtre, imbrication province/région correcte, régression directe sur
  l'ordre lon/lat (centroïde d'une commune connue dans l'emprise du Maroc).
- **Formulaires** : soumission `commune_geom`, `is_geolocated()` basé dessus,
  fiche publique affiche correctement région/province/commune pour une
  annonce utilisant la nouvelle chaîne *et* pour une annonce legacy (non
  régression sur les 22 déjà publiées), filtre catalogue région fonctionne
  sur les deux chaînes.

## Hors périmètre (suites possibles)

Douars (aucune géométrie officielle disponible — référentiel texte seul si
un jour voulu, à partir du fichier HCP RGPH 2014 XLSX). Filtres catalogue
Province/Commune. Simplification de géométrie pour l'affichage carte d'une
région entière. Dépréciation complète de `geo.Commune`/`Parcelle.commune`
une fois suffisamment de données réelles accumulées sur `commune_geom`.
