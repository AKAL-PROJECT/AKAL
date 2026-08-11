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
exports complets originaux ne demande aucun changement de code.

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
      "date_scraping": "..."
    }
  ]
}
```
