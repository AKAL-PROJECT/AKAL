# pyrefly: ignore [missing-import]
from django.contrib.gis.db import models as gis_models
from django.db import models


class Region(models.Model):
    """Région du Maroc."""

    id = models.IntegerField(primary_key=True)
    nom = models.CharField(max_length=255)
    code = models.CharField(max_length=50)

    class Meta:
        db_table = 'region'
        verbose_name = 'Région'
        verbose_name_plural = 'Régions'

    def __str__(self):
        return self.nom


class Province(models.Model):
    """Province / Préfecture."""

    id = models.IntegerField(primary_key=True)
    region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name='provinces')
    nom = models.CharField(max_length=255)
    code = models.CharField(max_length=50)

    class Meta:
        db_table = 'province'
        verbose_name = 'Province'
        verbose_name_plural = 'Provinces'

    def __str__(self):
        return self.nom


class Commune(models.Model):
    """Commune."""

    id = models.IntegerField(primary_key=True)
    province = models.ForeignKey(Province, on_delete=models.CASCADE, related_name='communes')
    nom = models.CharField(max_length=255)

    class Meta:
        db_table = 'commune'
        verbose_name = 'Commune'
        verbose_name_plural = 'Communes'

    def __str__(self):
        return self.nom


# ──────────────────────────────────────────────
# RÉFÉRENTIEL GÉOMÉTRIQUE OFFICIEL (2026-08-06)
#
# Distinct de Region/Province/Commune ci-dessus (jeu de démo minuscule, non
# géométrique, gardé tel quel — 13 communes déjà référencées par de vraies
# Parcelle, y compris des données UAT d'autres testeurs, jamais migrées ni
# retouchées ici). Ce nouveau référentiel est alimenté par
# `manage.py import_geo_officiel` depuis deux shapefiles officiels
# (backend/geo/data/, cf. SOURCES.md) — 12 régions, 75 provinces, 1536
# communes réelles. Parcelle.commune_geom (annonces/models.py) y pointe en
# plus de l'ancien Parcelle.commune, jamais à la place.
#
# Cf. docs/plans/2026-08-06-communes-geo-design.md pour l'historique des
# décisions (notamment pourquoi il n'y a pas de champ `region` dupliqué sur
# CommuneGeom, et pourquoi `province` y est non-nullable).
# ──────────────────────────────────────────────

class RegionOfficielle(models.Model):
    """
    Région administrative officielle du Maroc (12, découpage 2015, codes HCP).

    `code` est le code HCP (1-12), figé par la source — jamais réassigné.
    `slug` reprend la même convention que Region.code ci-dessus
    ("fes-meknes", ...) pour que le contrat API public ({code, nom}, cf.
    RegionNestedSerializer côté annonces) reste identique quelle que soit la
    chaîne (legacy ou officielle) qui alimente une Parcelle donnée.
    """

    code = models.PositiveSmallIntegerField(primary_key=True)
    slug = models.SlugField(unique=True)
    nom = models.CharField(max_length=100)

    class Meta:
        db_table = 'region_officielle'
        verbose_name = 'Région officielle'
        verbose_name_plural = 'Régions officielles'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(code__gte=1, code__lte=12),
                name='region_officielle_code_1_12',
            ),
        ]

    def __str__(self):
        return self.nom


class ProvinceGeom(models.Model):
    """
    Province/préfecture officielle, avec géométrie (source : sig-maroc.com,
    cf. SOURCES.md — licence ODbL, attribution requise si exposée
    publiquement).
    """

    iso = models.CharField(max_length=20, unique=True)  # ex. "MA-03-131"
    nom = models.CharField(max_length=150)
    nom_ar = models.CharField(max_length=150, blank=True)
    region = models.ForeignKey(
        RegionOfficielle, on_delete=models.PROTECT, related_name='provinces'
    )
    geom = gis_models.MultiPolygonField(srid=4326)

    class Meta:
        db_table = 'province_geom'
        verbose_name = 'Province (géométrie officielle)'
        verbose_name_plural = 'Provinces (géométrie officielle)'

    def __str__(self):
        return self.nom


class CommuneGeom(models.Model):
    """
    Commune officielle, avec géométrie (source : shapefile Commune_Maroc,
    cf. SOURCES.md).

    `province` est non-nullable par construction : `import_geo_officiel`
    doit résoudre la province de chaque commune (jointure spatiale) ou
    échoue explicitement plutôt que d'importer une commune sans province
    (décision du 2026-08-06 — cf. docs/plans, pas de champ `region` dupliqué
    ici, dérivable via `province.region`).
    """

    class TypeCommune(models.TextChoices):
        RURALE = 'CR', 'Rurale'
        URBAINE = 'MU', 'Urbaine'

    # Index de feature du shapefile source — clé d'idempotence stable pour
    # l'import (LIBELLE n'est pas garanti unique au niveau national).
    source_fid = models.PositiveIntegerField(unique=True)
    libelle = models.CharField(max_length=100)  # brut shapefile, ex "CR IMLILI"
    nom_affichage = models.CharField(max_length=100, db_index=True)  # nettoyé, ex "Imlili"
    # Nullable : sur les 1536 communes, seules ~806 portent un marqueur
    # explicite dans LIBELLE (préfixe "CR "/"MU " ou suffixe "(Mun.)") — les
    # ~730 autres n'ont aucun indice fiable. Deviner (ex. défaut "Rurale",
    # majoritaire dans l'absolu) aurait fabriqué une donnée qu'on n'a pas,
    # même logique que la province non devinée par nom (cf. décisions du
    # 2026-08-06). NULL = classification inconnue, jamais approximée.
    type_commune = models.CharField(max_length=2, choices=TypeCommune.choices, null=True, blank=True)
    province = models.ForeignKey(
        ProvinceGeom, on_delete=models.PROTECT, related_name='communes'
    )
    geom = gis_models.MultiPolygonField(srid=4326)

    class Meta:
        db_table = 'commune_geom'
        verbose_name = 'Commune (géométrie officielle)'
        verbose_name_plural = 'Communes (géométrie officielle)'

    def __str__(self):
        return self.nom_affichage
