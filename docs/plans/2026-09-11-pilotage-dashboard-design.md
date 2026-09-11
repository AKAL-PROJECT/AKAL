# Mini-dashboard décisionnel (O7) — design

Date : 2026-09-11
Contexte : audit des 7 objectifs de stage, O7 constatait un dashboard
uniquement individuel (vendeur), aucun pilotage global. Demande explicite
(Priorité 5) : un MVP administrateur, pas un « énorme dashboard », avec la
liste de KPI ci-dessous + « quelques graphiques simples ». Implémenté
directement (instruction explicite de l'utilisatrice), sans dialogue de
cadrage préalable — ce document trace les décisions prises.

## Décision d'architecture : réutiliser Django Admin, pas une page Next.js

Options considérées :
- **(retenue)** Une vue Django classique, gated `@staff_member_required`
  (même session que `/admin/`), rendue en HTML côté serveur, montée à
  `/admin/pilotage/`.
- (écartée) Une page Next.js authentifiée + un nouvel endpoint DRF staff-only.

Retenue pour 3 raisons : (1) réutilise le contrôle d'accès `is_staff` déjà
en place, zéro nouvelle auth à écrire/sécuriser ; (2) zéro dépendance JS —
les graphiques sont des barres 100 % CSS calculées côté Python (largeur en
%), cohérent avec « pas un énorme dashboard » ; (3) c'est la première page
HTML server-rendue du projet (tout le reste est API/DRF) — ajouter une
route Next.js aurait demandé bien plus de plomberie (nouvelle page, guard
d'auth frontend, nouvel endpoint, sérialisation) pour un MVP interne que
seul le staff consulte.

`akal/pilotage.py` est un module de PROJET, pas une app Django : la vue
agrège en lecture seule 4 apps (accounts, annonces, messaging, agriscore)
sans appartenir en propre à aucune — créer une 5ᵉ app pour une seule vue de
synthèse aurait été disproportionné.

## KPI et leur source

| KPI | Requête |
|---|---|
| 👥 Utilisateurs actifs (30 j) | `User.objects.filter(last_login__gte=...).count()` — proxy le plus honnête sans nouveau tracking |
| 🏡 Parcelles publiées | `Annonce.objects.en_ligne().dataset_actif().count()` — même filtre que le graphique région, pour que les deux s'additionnent |
| 👁️ Consultations de fiches | `Sum(StatistiqueAnnonce.vues)` (déjà existant) |
| ❤️ Favoris | `Favori.objects.count()` |
| 💬 Contacts vendeurs | `Conversation.objects.count()` |
| 📈 Taux visite → contact | contacts ÷ vues, 0.0 % si aucune vue (jamais une division par zéro) |
| 🌱 Consultations AgriScore | `Sum(StatistiquePasseport.compteur)` (nouveau, cf. ci-dessous) |
| 📍 Répartition par région | `annonces.stats_annonces_par_region()`, extrait de `AnnonceStatsRegionAPIView` (2026-08-18) pour être réutilisé ici sans dupliquer la logique de correspondance légacy/officielle |

Bonus (au-delà de la liste demandée, à effort quasi nul une fois le
mécanisme de graphique en place) : répartition des annonces par statut
(tout le pipeline, brouillon → vendue) — donne une deuxième lecture de
l'activité produit.

## Nouveau compteur : consultations AgriScore

Aucun tracking de consultation du Passeport n'existait. Ajouté
`agriscore.models.StatistiquePasseport` (une ligne par jour, compteur
global — pas par parcelle, aucun écran n'a besoin de cette granularité).
Incrémenté dans `PasseportParcelleAPIView.get()` (agriscore/api_views.py) à
chaque réponse 200, cache HIT ou calcul frais confondus : mesure l'usage
réel du produit, pas le taux de cache du pipeline. Jamais incrémenté sur
422/404/429 (pas un vrai passeport rendu). Fail-open (`DatabaseError` →
log + no-op), même patron que `ConfigurationAgriScore.pipeline_actif()`.

## Graphiques : barres CSS, pas de bibliothèque JS

`_barres(lignes)` (akal/pilotage.py) ajoute `pct` (0-100, relatif au
maximum de la série) à chaque ligne ; le template injecte `style="width:
{{ ligne.pct }}%"` sur un `<span>` — nécessite `display: block` en CSS
(un `span` reste `inline` par défaut, qui ignore `width`/`height` : bug
constaté puis corrigé pendant la vérification visuelle). Couleurs fixes
(pas les variables CSS `--primary`/`--darkened-bg` de Django Admin) :
constaté que les deux sont trop proches en luminosité dans le thème sombre
pour distinguer piste et remplissage à l'écran.

## Ce qui n'a PAS été fait (hors scope MVP, assumé)

- Pas de lien de navigation ajouté dans l'index de Django Admin vers
  `/admin/pilotage/` (template `admin/index.html` non surchargé) — la page
  est accessible directement à cette URL, documentée ici et dans la PR.
- Pas de fenêtre temporelle sur les KPI de volume (favoris, contacts,
  vues, consultations AgriScore) — totaux depuis toujours, comme
  `MesStatistiquesAPIView` le fait déjà pour `vues_totales`.
- Pas d'export CSV/PDF, pas de filtre de période interactif.

## Tests

- `agriscore/tests.py` : `StatistiquePasseportTests` (incrémentation,
  une ligne par jour, fail-open DB down) + extension de
  `PasseportParcelleAPITests` (incrémenté sur cache hit ET calcul frais,
  jamais sur 422/429).
- `annonces/tests_pilotage.py` (nouveau fichier, dans `annonces/` pour la
  découverte de tests — `akal/` n'étant pas une app) : accès (anonyme/non-
  staff redirigés, staff accède), exactitude des 7 KPI et des 2 graphiques
  via `response.context`, fonctions pures `_barres`/`_pourcentage` isolées.
- Vérification visuelle (chrome-devtools MCP, thème sombre et clair) sur
  la base de développement réelle — a révélé puis corrigé le bug CSS
  `display: block` ci-dessus, invisible aux tests unitaires (qui vérifient
  `pct` dans le contexte, pas le rendu visuel).
