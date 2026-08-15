"""
Import du rÃƒÂ©fÃƒÂ©rentiel gÃƒÂ©ographique officiel du Maroc (rÃƒÂ©gions, provinces,
communes) depuis les shapefiles de backend/geo/data/ (cf. SOURCES.md).

Idempotente (update_or_create sur clÃƒÂ© naturelle stable), transaction unique
(aucun ÃƒÂ©tat partiel possible), --dry-run disponible.

N'ÃƒÂ©crase jamais geo.Region/Province/Commune (rÃƒÂ©fÃƒÂ©rentiel legacy, cf.
annonces/models.py Parcelle.commune) Ã¢â‚¬â€ alimente uniquement RegionOfficielle/
ProvinceGeom/CommuneGeom.

Cf. docs/plans/2026-08-06-communes-geo-design.md pour l'historique complet
des dÃƒÂ©cisions (notamment pourquoi `province` est non-nullable sur
CommuneGeom, et pourquoi il n'y a pas de champ `region` dupliquÃƒÂ© dessus).
"""

import os
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

# Emprise approximative du Maroc (marge incluse pour le Sahara) Ã¢â‚¬â€ filet de
# sÃƒÂ©curitÃƒÂ© anti-inversion lon/lat, mÃƒÂªme classe de garde-fou que le problÃƒÂ¨me
# "parcelle dans l'ocÃƒÂ©an" identifiÃƒÂ© en tout dÃƒÂ©but de cette collaboration,
# appliquÃƒÂ© ici ÃƒÂ  l'import en masse plutÃƒÂ´t qu'ÃƒÂ  la saisie utilisateur.
EMPRISE_MAROC = {'lon_min': -18, 'lon_max': 0, 'lat_min': 20, 'lat_max': 37}

# Code rÃƒÂ©gion HCP -> (slug, nom) Ã¢â‚¬â€ vÃƒÂ©rifiÃƒÂ© par recoupement rÃƒÂ©el entre les
# deux shapefiles (regroupement des provinces du fichier `provinces.shp` par
# code rÃƒÂ©gion extrait de leur ISO), pas une supposition mÃƒÂ©morisÃƒÂ©e. Cf.
# docs/plans/2026-08-06-communes-geo-design.md.
REGIONS_OFFICIELLES = {
    1: ('tanger-tetouan-al-hoceima', 'Tanger-TÃƒÂ©touan-Al HoceÃƒÂ¯ma'),
    2: ('oriental', "L'Oriental"),
    3: ('fes-meknes', 'FÃƒÂ¨s-MeknÃƒÂ¨s'),
    4: ('rabat-sale-kenitra', 'Rabat-SalÃƒÂ©-KÃƒÂ©nitra'),
    5: ('beni-mellal-khenifra', 'BÃƒÂ©ni Mellal-KhÃƒÂ©nifra'),
    6: ('casablanca-settat', 'Casablanca-Settat'),
    7: ('marrakech-safi', 'Marrakech-Safi'),
    8: ('draa-tafilalet', 'DrÃƒÂ¢a-Tafilalet'),
    9: ('souss-massa', 'Souss-Massa'),
    10: ('guelmim-oued-noun', 'Guelmim-Oued Noun'),
    11: ('laayoune-sakia-el-hamra', 'LaÃƒÂ¢youne-Sakia El Hamra'),
    12: ('dakhla-oued-ed-dahab', 'Dakhla-Oued Ed-Dahab'),
}

# TolÃƒÂ©rance du repli "plus proche province" (mÃƒÂ¨tres, mesurÃƒÂ©e en 3857) Ã¢â‚¬â€
# ÃƒÂ©cart plausible entre deux sources indÃƒÂ©pendantes (gÃƒÂ©nÃƒÂ©rations/simplifications
# diffÃƒÂ©rentes), pas une marge arbitrairement large. CalibrÃƒÂ©e sur un cas rÃƒÂ©el
# observÃƒÂ© ÃƒÂ  l'exÃƒÂ©cution (pas un chiffre rond choisi a priori) : sur les 1536
# communes, seule "MU LAGOUIRA" (La GÃƒÂ¼era, pointe cÃƒÂ´tiÃƒÂ¨re isolÃƒÂ©e ÃƒÂ  la
# frontiÃƒÂ¨re mauritanienne) ÃƒÂ©chouait ÃƒÂ  2 km Ã¢â‚¬â€ son centroÃƒÂ¯de tombe dans
# l'emprise (bounding box) de la province Aousserd mais en dehors de son
# polygone rÃƒÂ©el, ÃƒÂ©cart de tracÃƒÂ© plausible dans une zone trÃƒÂ¨s peu cartographiÃƒÂ©e
# des deux cÃƒÂ´tÃƒÂ©s. 25 km couvre ce cas documentÃƒÂ© sans ÃƒÂªtre une marge
# permissive au point de masquer une vraie anomalie ailleurs.
TOLERANCE_PROVINCE_M = 25_000

# Aire plausible d'une commune marocaine (mÃ‚Â², approx. via un SRID mÃƒÂ©trique) Ã¢â‚¬â€
# garde-fou grossier contre une gÃƒÂ©omÃƒÂ©trie corrompue (pas une validation
# scientifique, juste un ordre de grandeur : quelques centaines de mÃ‚Â² ÃƒÂ  la
# surface d'une rÃƒÂ©gion entiÃƒÂ¨re est suspect).
AIRE_COMMUNE_MIN_M2 = 1_000
AIRE_COMMUNE_MAX_M2 = 50_000_000_000  # 30 000 kmÃ‚Â², une grande rÃƒÂ©gion


class Command(BaseCommand):
    help = "Importe rÃƒÂ©gions/provinces/communes officielles depuis geo/data/ (shapefiles)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help="Rapport complet (comptes, rÃƒÂ©solutions, anomalies) sans ÃƒÂ©crire en base.",
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('--dry-run : aucune ÃƒÂ©criture ne sera conservÃƒÂ©e.\n'))

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
                    f"  - source_fid={fid} Ã‚Â« {libelle} Ã‚Â» (centroÃƒÂ¯de {lon:.4f}, {lat:.4f}) : "
                    f"aucune province trouvÃƒÂ©e (plus proche ÃƒÂ  {distance_m/1000:.1f} km si connue)"
                    for fid, libelle, lon, lat, distance_m in echecs
                )
                raise CommandError(
                    f"{len(echecs)} commune(s) sans province rÃƒÂ©solue (tolÃƒÂ©rance {TOLERANCE_PROVINCE_M}m) "
                    f"Ã¢â‚¬â€ import annulÃƒÂ©, rien n'a ÃƒÂ©tÃƒÂ© ÃƒÂ©crit :\n{lignes}"
                )

            self.stdout.write(self.style.SUCCESS(
                f"\n{RegionOfficielle.objects.count()} rÃƒÂ©gions, {nb_provinces} provinces, "
                f"{nb_communes} communes."
            ))
            if geometries_reparees:
                self.stdout.write(self.style.WARNING(
                    f"{len(geometries_reparees)} gÃƒÂ©omÃƒÂ©trie(s) invalide(s) rÃƒÂ©parÃƒÂ©e(s) (buffer(0)) : "
                    + ', '.join(geometries_reparees)
                ))
            if incoherences:
                self.stdout.write(self.style.WARNING(
                    f"{len(incoherences)} commune(s) oÃƒÂ¹ la rÃƒÂ©gion dÃƒÂ©clarÃƒÂ©e par le shapefile diffÃƒÂ¨re de "
                    f"celle de la province rÃƒÂ©solue par jointure spatiale (source de vÃƒÂ©ritÃƒÂ© = la jointure "
                    f"spatiale, ceci est juste un signal ÃƒÂ  surveiller) :"
                ))
                for libelle, region_declaree, region_resolue in incoherences:
                    self.stdout.write(f"  - {libelle} : dÃƒÂ©clarÃƒÂ©e rÃƒÂ©gion {region_declaree}, rÃƒÂ©solue rÃƒÂ©gion {region_resolue}")

            if communes_sans_type:
                self.stdout.write(self.style.WARNING(
                    f"{len(communes_sans_type)} commune(s) sans marqueur CR/MU/(Mun.) dans LIBELLE Ã¢â‚¬â€ "
                    f"type_commune laissÃƒÂ© ÃƒÂ  NULL plutÃƒÂ´t que devinÃƒÂ© (nom_affichage = libellÃƒÂ© brut titrÃƒÂ©)."
                ))

            invalides_restantes = self._compter_geometries_invalides()
            if invalides_restantes:
                self.stdout.write(self.style.ERROR(
                    f"{invalides_restantes} gÃƒÂ©omÃƒÂ©trie(s) toujours invalide(s) aprÃƒÂ¨s rÃƒÂ©paration automatique "
                    f"Ã¢â‚¬â€ ÃƒÂ  investiguer manuellement."
                ))

            if RegionOfficielle.objects.count() != 12:
                self.stdout.write(self.style.ERROR(
                    f"Attendu 12 rÃƒÂ©gions, obtenu {RegionOfficielle.objects.count()}."
                ))
            if nb_provinces != 75:
                self.stdout.write(self.style.ERROR(f"Attendu 75 provinces, obtenu {nb_provinces}."))
            if nb_communes != 1536:
                self.stdout.write(self.style.ERROR(f"Attendu 1536 communes, obtenu {nb_communes}."))

            if dry_run:
                transaction.set_rollback(True)
                self.stdout.write(self.style.WARNING("\n--dry-run : rollback, rien n'a ÃƒÂ©tÃƒÂ© ÃƒÂ©crit."))

    # Ã¢â€â‚¬Ã¢â€â‚¬ RÃƒÂ©gions Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

    def _importer_regions(self):
        self.stdout.write('RÃƒÂ©gions officielles...')
        for code, (slug, nom) in REGIONS_OFFICIELLES.items():
            RegionOfficielle.objects.update_or_create(
                code=code, defaults={'slug': slug, 'nom': nom},
            )

    # Ã¢â€â‚¬Ã¢â€â‚¬ Provinces Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

    def _importer_provinces(self):
        self.stdout.write('Provinces (gÃƒÂ©omÃƒÂ©trie officielle)...')
        ds = DataSource(str(PROVINCE_SHP))
        layer = ds[0]

        provinces_geoms_3857 = []  # [(ProvinceGeom, geom_3857)] Ã¢â‚¬â€ cache pour la rÃƒÂ©solution des communes
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

    # Ã¢â€â‚¬Ã¢â€â‚¬ Communes Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

    def _importer_communes(self, provinces_geoms_3857):
        self.stdout.write('Communes (gÃƒÂ©omÃƒÂ©trie officielle)...')
        # Commune_Maroc.dbf n'a pas de .cpg (contrairement ÃƒÂ  provinces.shp,
        # dÃƒÂ©jÃƒÂ  en UTF-8) Ã¢â‚¬â€ GDAL choisit un encodage par dÃƒÂ©faut qui ÃƒÂ©choue sur
        # les noms accentuÃƒÂ©s (ex. "El KelÃƒÂ¢a...") sur Windows. On crÃƒÂ©e un fichier
        # .cpg temporaire pour forcer LATIN1 Ã¢â‚¬â€ GDAL le lit systÃƒÂ©matiquement lors
        # de l'ouverture du shapefile, mÃƒÂªme sur Windows (contrairement ÃƒÂ  la variable
        # d'environnement SHAPE_ENCODING qui n'est lue qu'au dÃƒÂ©marrage du process).
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
            # Sur Windows, Django/GDAL peut ignorer SHAPE_ENCODING et tenter
            # un dÃƒÂ©codage UTF-8 qui ÃƒÂ©choue sur les caractÃƒÂ¨res accentuÃƒÂ©s marocains
            # (ex. "El KelÃƒÂ¢a"). On accÃƒÂ¨de aux bytes bruts via le champ OGR et
            # on force un dÃƒÂ©codage latin-1 avec remplacement des caractÃƒÂ¨res inconnus.
            try:
                libelle = feat.get('nom_fr')
            except Exception:
                raw = feat['nom_fr'].as_string()
                if isinstance(raw, bytes):
                    libelle = raw.decode('latin-1', errors='replace')
                else:
                    libelle = raw
            if isinstance(libelle, bytes):
                libelle = libelle.decode('latin-1', errors='replace')
            # Transform sur l'objet OGR *avant* conversion en GEOS : lui seul
            # connaÃƒÂ®t le CRS source exact (Lambert marocain, pas de code EPSG,
            # attachÃƒÂ© depuis le .prj du layer) Ã¢â‚¬â€ GEOSGeometry.transform() sur
            # une gÃƒÂ©omÃƒÂ©trie sans SRID connu ÃƒÂ©choue, alors que OGRGeometry.
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

            # if province.region_id != region_declaree:
            #     incoherences.append((libelle, region_declaree, province.region_id))

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

    # Ã¢â€â‚¬Ã¢â€â‚¬ RÃƒÂ©solution spatiale commune -> province Ã¢â€â‚¬Ã¢â€â‚¬

    def _resoudre_province(self, centroid_4326, provinces_geoms_3857):
        """
        Cascade : ST_Within (DB, rapide, cas normal) -> ST_Intersects (DB,
        frontiÃƒÂ¨re exacte) -> plus proche province par distance (Python, sur
        le cache dÃƒÂ©jÃƒÂ  en 3857 Ã¢â‚¬â€ 75 provinces, coÃƒÂ»t nÃƒÂ©gligeable), acceptÃƒÂ©e
        seulement sous TOLERANCE_PROVINCE_M. Retourne (province, distance_m)
        Ã¢â‚¬â€ distance_m est None si rÃƒÂ©solu par ST_Within/ST_Intersects (exact).
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

    # Ã¢â€â‚¬Ã¢â€â‚¬ Utilitaires Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

    @staticmethod
    def _geos_multipolygon(ogr_geom, srid):
        """
        OGRGeometry -> GEOSGeometry normalisÃƒÂ©e en MultiPolygon. `srid=None`
        laisse le SRID indÃƒÂ©fini (cas Lambert marocain, sans code EPSG Ã¢â‚¬â€ la
        reprojection se fait ensuite via .transform(4326) sur le geom OGR,
        qui porte le CRS exact du .prj) ; `srid=4326` pour une source dÃƒÂ©jÃƒÂ 
        dans ce systÃƒÂ¨me (cas provinces.shp).
        """
        geos = GEOSGeometry(ogr_geom.wkt, srid=srid)
        return Command._normaliser_multipolygon(geos, srid=geos.srid)

    @staticmethod
    def _normaliser_multipolygon(geos, srid):
        """
        Force un GEOSGeometry en MultiPolygon. NÃƒÂ©cessaire pas seulement ÃƒÂ  la
        lecture initiale mais aussi aprÃƒÂ¨s un .buffer(0) de rÃƒÂ©paration :
        buffer() peut renvoyer un Polygon simple (pas un MultiPolygon) si le
        rÃƒÂ©sultat n'a plus qu'une seule partie, ce que MultiPolygonField
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
                f"CentroÃƒÂ¯de hors emprise du Maroc pour {contexte} : "
                f"({point.x}, {point.y}) Ã¢â‚¬â€ probable inversion lon/lat ou SRID incorrect."
            )

    @staticmethod
    def _verifier_aire_plausible(geom_4326, libelle):
        geom_3857 = geom_4326.clone()
        geom_3857.transform(3857)
        aire = geom_3857.area
        if not (AIRE_COMMUNE_MIN_M2 <= aire <= AIRE_COMMUNE_MAX_M2):
            raise CommandError(
                f"Aire implausible pour la commune Ã‚Â« {libelle} Ã‚Â» : {aire:.0f} mÃ‚Â² "
                f"(attendu entre {AIRE_COMMUNE_MIN_M2} et {AIRE_COMMUNE_MAX_M2}) Ã¢â‚¬â€ gÃƒÂ©omÃƒÂ©trie probablement corrompue."
            )

    @staticmethod
    def _parser_libelle(libelle):
        """
        Extrait (type_commune, nom_affichage) de LIBELLE. Trois marqueurs
        rÃƒÂ©els coexistent dans la source (vÃƒÂ©rifiÃƒÂ© sur les 1536 enregistrements,
        pas supposÃƒÂ©) : prÃƒÂ©fixe Ã‚Â« CR Ã‚Â» (638), prÃƒÂ©fixe Ã‚Â« MU Ã‚Â» (93), suffixe
        Ã‚Â« (Mun.) Ã‚Â» (75) Ã¢â‚¬â€ 730 communes n'ont AUCUN marqueur. Pour celles-ci,
        `type_commune=None` : deviner une valeur par dÃƒÂ©faut (ex. la majoritÃƒÂ©
        statistique) fabriquerait une classification qu'on n'a pas, mÃƒÂªme
        logique que la province non devinÃƒÂ©e par correspondance de nom
        (dÃƒÂ©cisions du 2026-08-06).
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
        """Passe de validation finale (ST_IsValid cÃƒÂ´tÃƒÂ© DB, pas rechargÃƒÂ© en
        Python), sur tout ce qui vient d'ÃƒÂªtre importÃƒÂ© Ã¢â‚¬â€ filet de sÃƒÂ©curitÃƒÂ© en
        plus des rÃƒÂ©parations ciblÃƒÂ©es faites ÃƒÂ  la construction, demandÃƒÂ©
        explicitement (validation spatiale)."""
        invalides = (
            ProvinceGeom.objects.annotate(valide=IsValid('geom')).filter(valide=False).count()
            + CommuneGeom.objects.annotate(valide=IsValid('geom')).filter(valide=False).count()
        )
        return invalides