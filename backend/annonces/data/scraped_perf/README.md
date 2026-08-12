# Échantillon de test de volume/vitesse — Avito / Mubawab

⚠️ **Distinct de `annonces/data/scraped/`** (fixtures de démo de la PR
d'origine, import de données scrapées). Ce dossier sert un usage différent :
**tester le catalogue à un volume réaliste** (pagination, carte à
nombreux marqueurs, filtres, temps de rendu) — pas une démonstration
fonctionnelle minimale.

## Nature des données

**100% synthétique** — contrairement à `annonces/data/scraped/` (qui
contient 10 entrées Avito réellement recopiées d'un export), aucune entrée
ici n'est transcrite d'un export réel. Structure et distribution de
qualité de données (nulls sur `prix_dh`/`surface_m2`, noms de communes
marocaines réels) fidèles aux exports fournis, à l'échelle réelle annoncée
(220 Avito + 48 Mubawab).

## Photos

Le CDN Avito bloque le hotlinking (403, cf. audit du 2026-08-11) — les
URLs `content.avito.ma` de ce fichier ne sont donc **jamais**
téléchargeables telles quelles, exactement comme un vrai export Avito
utilisé tel quel. Pour obtenir un catalogue publié à volume réaliste :

- **36 entrées** portent `_images_test_substituees: true` — une image
  Mubawab réelle et vérifiée, **unique par entrée**.
- **56 entrées** portent `_images_test_reutilisees: true` — une image
  reprise **en cycle** parmi les 36 ci-dessus (36 images réelles ne
  suffisaient pas pour couvrir les 92 annonces géolocalisables de cet
  échantillon). Légitime pour un test de volume/vitesse (on exerce le
  pipeline de stockage/rendu réel), **pas pour une démo visuelle** où
  chaque annonce doit avoir sa propre photo — utiliser
  `annonces/data/scraped/` pour ça.
- Les autres entrées Avito géolocalisables sans ces marqueurs, ainsi que
  toutes les entrées Mubawab (jamais géolocalisable, aucun champ de
  localité structuré dans l'export), n'ont pas de photo et resteront en
  `brouillon` après import — comportement normal, jamais contourné.

## Usage

```bash
python manage.py import_scraped_data \
  --source avito --file backend/annonces/data/scraped_perf/annonces_avito_220_perf.json \
  --max-photos 1

python manage.py import_scraped_data \
  --source mubawab --file backend/annonces/data/scraped_perf/annonces_mubawab_48_perf.json \
  --skip-images
```

Résultat observé (audit du 2026-08-12, base de dev locale) : 160 Avito +
30 Mubawab importées (60+18 rejetées, prix/surface absents — jamais
inventés), **92 publiées** (les 92 Avito géolocalisées avec image), 0
Mubawab publiée (jamais géolocalisable).
