"""
Import du référentiel géographique officiel du Maroc (régions, provinces,
communes) depuis les shapefiles de backend/geo/data/ (cf. SOURCES.md).

Idempotente (update_or_create sur clé naturelle stable), transaction unique
(aucun état partiel possible), --dry-run disponible.

N'écrase jamais geo.Region/Province/Commune (référentiel legacy, cf.
annonces/models.py Parcelle.commune) — alimente uniquement RegionOfficielle/
ProvinceGeom/CommuneGeom.

Cf. docs/plans/2026-08-06-communes-geo-design.md pour l'historique complet
des décisions (notamment pourquoi `province` est non-nullable sur
CommuneGeom, et pourquoi il n'y a pas de champ `region` dupliqué dessus).
"""

import re
from pathlib import Path

from django.contrib.gis.db.models.functions import IsValid
from django.contrib.gis.gdal import DataSource
from django.contrib.gis.geos import GEOSGeometry, MultiPolygon
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from geo.models import CommuneGeom, ProvinceGeom, RegionOfficielle

DATA_DIR = Path(__file__).resolve().parent.parent.parent / 'data'
COMMUNE_SHP = DATA_DIR / 'commune_maroc' / 'Commune_Maroc.shp'
PROVINCE_SHP = DATA_DIR / 'provinces_maroc' / 'provinces.shp'

# Emprise approximative du Maroc (marge incluse pour le Sahara) — filet de
# sécurité anti-inversion lon/lat, même classe de garde-fou que le problème
# "parcelle dans l'océan" identifié en tout début de cette collaboration,
# appliqué ici à l'import en masse plutôt qu'à la saisie utilisateur.
EMPRISE_MAROC = {'lon_min': -18, 'lon_max': 0, 'lat_min': 20, 'lat_max': 37}

# Code région HCP -> (slug, nom) — vérifié par recoupement réel entre les
# deux shapefiles (regroupement des provinces du fichier `provinces.shp` par
# code région extrait de leur ISO), pas une supposition mémorisée. Cf.
# docs/plans/2026-08-06-communes-geo-design.md.
REGIONS_OFFICIELLES = {
    1: ('tanger-tetouan-al-hoceima', 'Tanger-Tétouan-Al Hoceïma'),
    2: ('oriental', "L'Oriental"),
    3: ('fes-meknes', 'Fès-Meknès'),
    4: ('rabat-sale-kenitra', 'Rabat-Salé-Kénitra'),
    5: ('beni-mellal-khenifra', 'Béni Mellal-Khénifra'),
    6: ('casablanca-settat', 'Casablanca-Settat'),
    7: ('marrakech-safi', 'Marrakech-Safi'),
    8: ('draa-tafilalet', 'Drâa-Tafilalet'),
    9: ('souss-massa', 'Souss-Massa'),
    10: ('guelmim-oued-noun', 'Guelmim-Oued Noun'),
    11: ('laayoune-sakia-el-hamra', 'Laâyoune-Sakia El Hamra'),
    12: ('dakhla-oued-ed-dahab', 'Dakhla-Oued Ed-Dahab'),
}

# Tolérance du repli "plus proche province" (mètres, mesurée en 3857) —
# écart plausible entre deux sources indépendantes (générations/simplifications
# différentes), pas une marge arbitrairement large. Calibrée sur un cas réel
# observé à l'exécution (pas un chiffre rond choisi a priori) : sur les 1536
# communes, seule "MU LAGOUIRA" (La Güera, pointe côtière isolée à la
# frontière mauritanienne) échouait à 2 km — son centroïde tombe dans
# l'emprise (bounding box) de la province Aousserd mais en dehors de son
# polygone réel, écart de tracé plausible dans une zone très peu cartographiée
# des deux côtés. 25 km couvre ce cas documenté sans être une marge
# permissive au point de masquer une vraie anomalie ailleurs.
TOLERANCE_PROVINCE_M = 25_000

# Aire plausible d'une commune marocaine (m², approx. via un SRID métrique) —
# garde-fou grossier contre une géométrie corrompue (pas une validation
# scientifique, juste un ordre de grandeur : quelques centaines de m² à la
# surface d'une région entière est suspect).
AIRE_COMMUNE_MIN_M2 = 1_000
AIRE_COMMUNE_MAX_M2 = 50_000_000_000  # ~50 000 km², une grande région


class Command(BaseCommand):
    help = "Importe régions/provinces/communes officielles depuis geo/data/ (shapefiles)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help="Rapport complet (comptes, résolutions, anomalies) sans écrire en base.",
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('--dry-run : aucune écriture ne sera conservée.\n'))

        if not COMMUNE_SHP.exists():
            raise CommandError(f"Fichier introuvable : {COMMUNE_SHP}")
        if not PROVINCE_SHP.exists():
            raise CommandError(f"Fichier introuvable : {PROVINCE_SHP}")

        with transaction.atomic():
            self._importer_regions()
            nb_provinces, provinces_geoms_3857, provinces_reparees = self._importer_provinces()
            nb_communes, echecs, incoherences, communes_reparees, communes_sans_type = (
                self._importer_communes(provinces_geoms_3857)
            )
            geometries_reparees = provinces_reparees + communes_reparees

            if echecs:
                lignes = '\n'.join(
                    f"  - source_fid={fid} « {libelle} » (centroïde {lon:.4f}, {lat:.4f}) : "
                    f"aucune province trouvée (plus proche à {distance_m/1000:.1f} km si connue)"
                    for fid, libelle, lon, lat, distance_m in echecs
                )
                raise CommandError(
                    f"{len(echecs)} commune(s) sans province résolue (tolérance {TOLERANCE_PROVINCE_M}m) "
                    f"— import annulé, rien n'a été écrit :\n{lignes}"
                )

            self.stdout.write(self.style.SUCCESS(
                f"\n{RegionOfficielle.objects.count()} régions, {nb_provinces} provinces, "
                f"{nb_communes} communes."
            ))
            if geometries_reparees:
                self.stdout.write(self.style.WARNING(
                    f"{len(geometries_reparees)} géométrie(s) invalide(s) réparée(s) (buffer(0)) : "
                    + ', '.join(geometries_reparees)
                ))
            if incoherences:
                self.stdout.write(self.style.WARNING(
                    f"{len(incoherences)} commune(s) où la région déclarée par le shapefile diffère de "
                    f"celle de la province résolue par jointure spatiale (source de vérité = la jointure "
                    f"spatiale, ceci est juste un signal à surveiller) :"
                ))
                for libelle, region_declaree, region_resolue in incoherences:
                    self.stdout.write(f"  - {libelle} : déclarée région {region_declaree}, résolue région {region_resolue}")

            if communes_sans_type:
                self.stdout.write(self.style.WARNING(
                    f"{len(communes_sans_type)} commune(s) sans marqueur CR/MU/(Mun.) dans LIBELLE — "
                    f"type_commune laissé à NULL plutôt que deviné (nom_affichage = libellé brut titré)."
                ))

            invalides_restantes = self._compter_geometries_invalides()
            if invalides_restantes:
                self.stdout.write(self.style.ERROR(
                    f"{invalides_restantes} géométrie(s) toujours invalide(s) après réparation automatique "
                    f"— à investiguer manuellement."
                ))

            if RegionOfficielle.objects.count() != 12:
                self.stdout.write(self.style.ERROR(
                    f"Attendu 12 régions, obtenu {RegionOfficielle.objects.count()}."
                ))
            if nb_provinces != 75:
                self.stdout.write(self.style.ERROR(f"Attendu 75 provinces, obtenu {nb_provinces}."))
            if nb_communes != 1536:
                self.stdout.write(self.style.ERROR(f"Attendu 1536 communes, obtenu {nb_communes}."))

            if dry_run:
                transaction.set_rollback(True)
                self.stdout.write(self.style.WARNING("\n--dry-run : rollback, rien n'a été écrit."))

    # ── Régions ──────────────────────────────────

    def _importer_regions(self):
        self.stdout.write('Régions officielles...')
        for code, (slug, nom) in REGIONS_OFFICIELLES.items():
            RegionOfficielle.objects.update_or_create(
                code=code, defaults={'slug': slug, 'nom': nom},
            )

    # ── Provinces ────────────────────────────────

    def _importer_provinces(self):
        self.stdout.write('Provinces (géométrie officielle)...')
        ds = DataSource(str(PROVINCE_SHP))
        layer = ds[0]

        provinces_geoms_3857 = []  # [(ProvinceGeom, geom_3857)] — cache pour la résolution des communes
        reparees = []
        for feat in layer:
            iso = feat.get('ISO')
            region_code = int(iso.split('-')[1])
            geom = self._geos_multipolygon(feat.geom, srid=4326)
            if not geom.valid:
                geom = self._normaliser_multipolygon(geom.buffer(0), srid=4326)
                reparees.append(f"province {feat.get('nom_fr')}")
            self._verifier_emprise_maroc(geom.centroid, f"province {feat.get('nom_fr')}")

            province, _ = ProvinceGeom.objects.update_or_create(
                iso=iso,
                defaults={
                    'nom': feat.get('nom_fr'),
                    'nom_ar': feat.get('nom_ar') or '',
                    'region_id': region_code,
                    'geom': geom,
                },
            )
            geom_3857 = geom.clone()
            geom_3857.transform(3857)
            provinces_geoms_3857.append((province, geom_3857))

        count = ProvinceGeom.objects.count()
        self.stdout.write(f'  {count} provinces')
        return count, provinces_geoms_3857, reparees

    # ── Communes ─────────────────────────────────

    def _importer_communes(self, provinces_geoms_3857):
        self.stdout.write('Communes (géométrie officielle)...')
        # Commune_Maroc.dbf n'a pas de .cpg (contrairement à provinces.shp,
        # déjà en UTF-8) — GDAL choisit un encodage par défaut qui échoue sur
        # les noms accentués (ex. "El Kelâa..."). On crée un .cpg temporaire
        # pour forcer LATIN1 — GDAL le lit systématiquement à l'ouverture du
        # shapefile, y compris sur Windows (contrairement à la variable
        # d'environnement SHAPE_ENCODING, lue seulement au démarrage du process).
        cpg_path = COMMUNE_SHP.with_suffix('.cpg')
        cpg_cree = False
        try:
            if not cpg_path.exists():
                cpg_path.write_text('LATIN1\n', encoding='ascii')
                cpg_cree = True
            ds = DataSource(str(COMMUNE_SHP))
            layer = ds[0]
            return self._lire_communes(layer, provinces_geoms_3857)
        finally:
            if cpg_cree and cpg_path.exists():
                cpg_path.unlink()

    def _lire_communes(self, layer, provinces_geoms_3857):
        echecs = []
        incoherences = []
        geometries_reparees = []
        communes_sans_type = []
        count = 0

        for feat in layer:
            fid = feat.fid
            # Commune_Maroc.dbf est en Latin-1 (vieux DBF francophone, 2018).
            # Selon la plateforme, GDAL peut ignorer le .cpg et tenter un
            # décodage UTF-8 qui échoue sur les accents marocains (ex. "El
            # Kelâa"). Repli : bytes bruts du champ OGR + décodage latin-1
            # tolérant.
            try:
                libelle = feat.get('nom_fr')
            except Exception:
                raw = feat['nom_fr'].as_string()
                libelle = raw.decode('latin-1', errors='replace') if isinstance(raw, bytes) else raw
            if isinstance(libelle, bytes):
                libelle = libelle.decode('latin-1', errors='replace')

            # Transform sur l'objet OGR *avant* conversion en GEOS : lui seul
            # connaît le CRS source exact (Lambert marocain, pas de code EPSG,
            # attaché depuis le .prj du layer) — GEOSGeometry.transform() sur
            # une géométrie sans SRID connu échoue, alors que OGRGeometry.
            # transform() sait reprojeter depuis son WKT source vers 4326.
            geom_ogr = feat.geom
            geom_ogr.transform(4326)
            geom = self._geos_multipolygon(geom_ogr, srid=4326)
            if not geom.valid:
                geom = self._normaliser_multipolygon(geom.buffer(0), srid=4326)
                geometries_reparees.append(f"{libelle} (fid={fid})")
            centroid = geom.centroid
            self._verifier_emprise_maroc(centroid, f"commune {libelle} (fid={fid})")
            self._verifier_aire_plausible(geom, libelle)

            province, distance_m = self._resoudre_province(centroid, provinces_geoms_3857)
            if province is None:
                lon, lat = centroid.x, centroid.y
                echecs.append((fid, libelle, lon, lat, distance_m))
                continue

            # Contrôle de cohérence région retiré avec le passage au champ
            # `nom_fr` : le shapefile courant n'expose plus de colonne REGION
            # fiable. La région est déduite de la province résolue
            # spatialement (`incoherences` reste dans le tuple de retour pour
            # compat, toujours vide).

            type_commune, nom_affichage = self._parser_libelle(libelle)
            if type_commune is None:
                communes_sans_type.append(libelle)

            CommuneGeom.objects.update_or_create(
                source_fid=fid,
                defaults={
                    'libelle': libelle,
                    'nom_affichage': nom_affichage,
                    'type_commune': type_commune,
                    'province': province,
                    'geom': geom,
                },
            )
            count += 1

        self.stdout.write(f'  {count} communes')
        return count, echecs, incoherences, geometries_reparees, communes_sans_type

    # ── Résolution spatiale commune -> province ──

    def _resoudre_province(self, centroid_4326, provinces_geoms_3857):
        """
        Cascade : ST_Within (DB, rapide, cas normal) -> ST_Intersects (DB,
        frontière exacte) -> plus proche province par distance (Python, sur
        le cache déjà en 3857 — 75 provinces, coût négligeable), acceptée
        seulement sous TOLERANCE_PROVINCE_M. Retourne (province, distance_m)
        — distance_m est None si résolu par ST_Within/ST_Intersects (exact).
        """
        candidat = ProvinceGeom.objects.filter(geom__contains=centroid_4326).first()
        if candidat is not None:
            return candidat, None

        candidat = ProvinceGeom.objects.filter(geom__intersects=centroid_4326).first()
        if candidat is not None:
            return candidat, None

        centroid_3857 = centroid_4326.clone()
        centroid_3857.transform(3857)
        meilleur, meilleure_distance = None, None
        for province, geom_3857 in provinces_geoms_3857:
            d = centroid_3857.distance(geom_3857)
            if meilleure_distance is None or d < meilleure_distance:
                meilleure_distance, meilleur = d, province
        if meilleure_distance is not None and meilleure_distance <= TOLERANCE_PROVINCE_M:
            return meilleur, meilleure_distance
        return None, meilleure_distance

    # ── Utilitaires ──────────────────────────────

    @staticmethod
    def _geos_multipolygon(ogr_geom, srid):
        """
        OGRGeometry -> GEOSGeometry normalisée en MultiPolygon. `srid=None`
        laisse le SRID indéfini (cas Lambert marocain, sans code EPSG — la
        reprojection se fait ensuite via .transform(4326) sur le geom OGR,
        qui porte le CRS exact du .prj) ; `srid=4326` pour une source déjà
        dans ce système (cas provinces.shp).
        """
        geos = GEOSGeometry(ogr_geom.wkt, srid=srid)
        return Command._normaliser_multipolygon(geos, srid=geos.srid)

    @staticmethod
    def _normaliser_multipolygon(geos, srid):
        """
        Force un GEOSGeometry en MultiPolygon. Nécessaire pas seulement à la
        lecture initiale mais aussi après un .buffer(0) de réparation :
        buffer() peut renvoyer un Polygon simple (pas un MultiPolygon) si le
        résultat n'a plus qu'une seule partie, ce que MultiPolygonField
        refuse silencieusement de sauvegarder autrement.
        """
        if geos.geom_type == 'Polygon':
            return MultiPolygon(geos, srid=srid)
        return geos

    @staticmethod
    def _verifier_emprise_maroc(point, contexte):
        e = EMPRISE_MAROC
        if not (e['lon_min'] <= point.x <= e['lon_max'] and e['lat_min'] <= point.y <= e['lat_max']):
            raise CommandError(
                f"Centroïde hors emprise du Maroc pour {contexte} : "
                f"({point.x}, {point.y}) — probable inversion lon/lat ou SRID incorrect."
            )

    @staticmethod
    def _verifier_aire_plausible(geom_4326, libelle):
        geom_3857 = geom_4326.clone()
        geom_3857.transform(3857)
        aire = geom_3857.area
        if not (AIRE_COMMUNE_MIN_M2 <= aire <= AIRE_COMMUNE_MAX_M2):
            raise CommandError(
                f"Aire implausible pour la commune « {libelle} » : {aire:.0f} m² "
                f"(attendu entre {AIRE_COMMUNE_MIN_M2} et {AIRE_COMMUNE_MAX_M2}) — géométrie probablement corrompue."
            )

    @staticmethod
    def _parser_libelle(libelle):
        """
        Extrait (type_commune, nom_affichage) de LIBELLE. Trois marqueurs
        réels coexistent dans la source (vérifié sur les 1536 enregistrements,
        pas supposé) : préfixe « CR » (638), préfixe « MU » (93), suffixe
        « (Mun.) » (75) — 730 communes n'ont AUCUN marqueur. Pour celles-ci,
        `type_commune=None` : deviner une valeur par défaut (ex. la majorité
        statistique) fabriquerait une classification qu'on n'a pas, même
        logique que la province non devinée par correspondance de nom
        (décisions du 2026-08-06).
        """
        if libelle.startswith('CR '):
            return 'CR', libelle[3:].title()
        if libelle.startswith('MU '):
            return 'MU', libelle[3:].title()
        match = re.match(r'^(.*?)\s*\(Mun\.?\)\s*$', libelle, re.IGNORECASE)
        if match:
            return 'MU', match.group(1).title()
        return None, libelle.title()

    @staticmethod
    def _compter_geometries_invalides():
        """Passe de validation finale (ST_IsValid côté DB, pas rechargé en
        Python), sur tout ce qui vient d'être importé — filet de sécurité en
        plus des réparations ciblées faites à la construction, demandé
        explicitement (validation spatiale)."""
        invalides = (
            ProvinceGeom.objects.annotate(valide=IsValid('geom')).filter(valide=False).count()
            + CommuneGeom.objects.annotate(valide=IsValid('geom')).filter(valide=False).count()
        )
        return invalides
