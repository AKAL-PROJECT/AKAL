# Sources des données géographiques officielles

Ces fichiers alimentent la commande `manage.py import_geo_officiel`
(cf. `docs/plans/2026-08-06-communes-geo-design.md`). Committés au repo pour
un import reproductible sans dépendre d'un fichier local à un poste
particulier.

## `commune_maroc/` — Commune_Maroc.shp

- **Source** : fournie par l'équipe AKAL (métadonnées DBF datées du
  2018-03-10).
- **Contenu** : 1536 polygones, communes du Maroc. Attributs `LIBELLE`
  (nom, préfixé `CR `/`MU `) et `REGION` (code région officiel HCP, 1-12).
- **CRS** : Lambert Conformal Conic marocain (Merchich/Nord Maroc — pas de
  code EPSG embarqué, transformation basée sur le WKT exact du `.prj`).
- **Licence** : non précisée par la source — usage interne au projet.

## `provinces_maroc/` — provinces.shp

- **Source** : [sig-maroc.com/donnees/shapefiles](https://sig-maroc.com/donnees/shapefiles),
  téléchargé le 2026-08-06 (édition du fichier : 2026-03-06).
- **Contenu** : 75 provinces/préfectures. Attributs `ISO` (`MA-XX-YYY`, XX =
  code région officiel), `nom_fr`, `nom_ar`, données démographiques
  (`P_ensemble`, `p_urbaine`, `p_rurale`, ...).
- **CRS** : EPSG:4326 (WGS 84) — déjà dans la convention utilisée partout
  ailleurs dans AKAL, aucune reprojection requise.
- **Licence** : ODbL (dérivé OpenStreetMap en partie, selon la source) —
  **attribution requise** en cas d'exposition publique de cette donnée
  (mention "© OpenStreetMap contributors" / sig-maroc.com), cf. attribution
  déjà en place sur les fonds de carte Leaflet de l'application.
