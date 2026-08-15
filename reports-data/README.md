# reports-data — Rapports de potentiel simulés (P2-01)

Script Python isolé (aucune dépendance à Django/PostGIS/Next.js) qui génère
des rapports de démonstration pour l'écran "Analyser le potentiel" (bouton
sur la fiche parcelle). **Toutes les données sont simulées** — ce n'est pas
un calcul agronomique réel, juste de quoi démontrer l'écran en attendant le
pipeline d'enrichissement réel (Phase 3).

## Utiliser

```bash
cd reports-data
python3 generate_reports.py            # 12 rapports (défaut)
python3 generate_reports.py --count 15
python3 generate_reports.py --seed 42  # reproductible
```

Aucune dépendance à installer — stdlib Python uniquement.

## Ce que ça produit

`output/` contient :
- un fichier `rapport-<id>.json` par rapport généré
- `_index.json` : la liste de tous les fichiers avec leur `annonce_ref` et
  leur `niveau_global`, pour retrouver rapidement le bon rapport sans ouvrir
  chaque fichier

6 des rapports sont rattachés aux 6 annonces mock existantes
(`frontend/src/data/parcelles.ts`, `annonce_ref.slug` correspond au `slug`
de l'annonce) — les autres sont des profils additionnels non rattachés
(`annonce_ref: null`), pour varier la démo.

## Contrat JSON (shape) — pour Mégane (reports-view/, affichage)

```json
{
  "id": "uuid",
  "annonce_ref": { "id": "p-01", "slug": "..." } ou null,
  "genere_le": "ISO 8601 UTC",
  "simule": true,
  "avertissement": "texte à toujours afficher — ne jamais masquer",
  "localisation": { "region": { "code", "nom" }, "commune", "latitude", "longitude" },
  "acces": { "type_route", "distance_ville_km", "acces_eau" },
  "pedologie": { "type_sol", "ph_estime", "profondeur_sol_cm" },
  "hydrique": { "niveau": "eleve|moyen|faible", "pluviometrie_moyenne_mm_an", "nappe_estimee_m" },
  "potentiel_agricole": { "niveau": "eleve|moyen|faible", "score_indicatif": 0-100 },
  "cultures_suggerees": ["...", "..."],
  "synthese": { "niveau_global": "eleve|moyen|faible", "resume": "texte court" }
}
```

Règles à respecter côté affichage :
- `simule: true` et le champ `avertissement` doivent **toujours** être visibles
  quelque part sur l'écran — jamais présenter ça comme une donnée réelle.
- `nappe_estimee_m` peut être `null` (cas `acces_eau: "irriguee"` — la
  profondeur de nappe n'est pas pertinente si déjà irriguée).
- `annonce_ref` peut être `null` — gérer ce cas dans l'affichage (rapport
  "standalone", pas rattaché à une fiche).
- Les niveaux (`hydrique.niveau`, `potentiel_agricole.niveau`,
  `synthese.niveau_global`) sont toujours l'une de ces 3 valeurs exactes :
  `"eleve"`, `"moyen"`, `"faible"`.

## Pourquoi un dossier isolé à la racine (pas dans frontend/ ou backend/)

Le PDF de répartition est explicite : "script Python isolé" pour ce
chantier — ni dépendance au front (TypeScript), ni couplage au back
(Django/PostGIS). Ça évite tout risque de collision de fichiers avec
Mégane ou Ibrahim, et ça reste exécutable même si le reste du projet ne
tourne pas.
