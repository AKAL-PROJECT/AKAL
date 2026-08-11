# Données scrapées — Avito / Mubawab

Fixtures utilisées par `python manage.py import_scraped_data` (cf.
`annonces/management/commands/import_scraped_data.py`).

**Note de provenance** : ces deux fichiers sont un sous-ensemble
représentatif (40 annonces Avito, 20 Mubawab) reprenant fidèlement la
structure des colonnes, les types de champs et les particularités réelles
de qualité de données observées dans les exports originaux fournis
(220 Avito + 48 Mubawab) — nulls fréquents sur `prix_dh`/`surface_m2`,
`categorie` parfois absente, encodage mojibake sur les caractères accentués
côté Avito (URLs/titres bruts), `titre_foncier` majoritairement `true`.

Les 10 premières entrées Avito sont recopiées telles quelles depuis
l'export original ; le reste (30 Avito + 20 Mubawab) est généré pour
reproduire la même distribution de qualité de données sans retranscrire
l'intégralité des 268 entrées à la main. La commande d'import ne fait
aucune hypothèse sur le nombre d'entrées : remplacer ces fichiers par les
exports complets originaux ne demande aucun changement de code (vérifié
avec un fichier de 268 entrées, cf. audit du 2026-08-11).

**Séparation réel/généré au niveau des données** (pas seulement dans ce
README) : chaque entrée porte un champ `_fixture_origine` —
`"export_reel"` ou `"generee_pour_tests"`. Ce champ est spécifique à ces
fixtures de démo, jamais lu par `import_scraped_data.py` (ignoré comme
toute clé JSON non reconnue) ni par un vrai export Avito/Mubawab — à ne
pas ajouter en dupliquant ces fichiers pour un usage réel.

**Exception documentée** : 3 entrées (`id_annonce` 51216156, 58419835 côté
`export_reel`, 58000000 côté `generee_pour_tests`) portent en plus
`"_images_test_substituees": true` — leur champ `images` d'origine (URLs
Avito, protégées contre le hotlinking, cf. audit du 2026-08-11) a été
remplacé par des URLs Mubawab réellement téléchargeables, pour disposer
d'au moins quelques annonces qui satisfont réellement
`Annonce.can_publish()` (photo + prix + surface + géolocalisation) lors
d'une démo locale. Aucune autre donnée de ces 3 entrées n'est modifiée.

## Format attendu

```json
{
  "date_export": "...",
  "nombre_annonces": 40,
  "colonnes": [...],
  "annonces": [
    {
      "id_annonce": "58432271",
      "url": "https://...",
      "titre": "...",
      "description": "...",
      "prix_dh": 420000,
      "surface_m2": null,
      "categorie": "Agricole",
      "titre_foncier": true,
      "images": ["https://..."],
      "date_scraping": "...",
      "_fixture_origine": "export_reel"
    }
  ]
}
```
