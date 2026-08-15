# AKAL — Protocole de test QA

**Propriétaire :** Destiné
**Objectif du sprint :** STABILISER → TESTER → CORRIGER → DÉMONTRER

Ce protocole teste des **parcours complets**, pas des boutons isolés. Le
bug type qu'on cherche (cf. PDF de répartition, §8) : chaque fonction
marche seule, mais une succession d'actions casse. On déroule donc des
enchaînements de bout en bout, dès qu'une brique est "à peu près debout"
— en continu pendant le sprint, pas seulement à la fin.

Chaque bug trouvé pendant ce protocole → un ticket dans
[`registre-bugs.md`](./registre-bugs.md), avec l'ID du scénario en
référence (ex. `A-04`) pour retrouver le contexte.

Légende des cases : `[ ]` à tester · `[x]` passé · `[!]` échoué (ticket
ouvert, ID noté entre parenthèses).

---

## A. Parcours Acheteur

Accueil → recherche → région → province → commune → résultats → filtre
prix → filtre surface → fiche → carte → retour → autre fiche → comparer
→ favori → connexion → dashboard → PDF

| # | Étape | Résultat attendu |
|---|---|---|
| A-01 | Accueil → lancer une recherche | Formulaire de recherche répond, pas de blocage |
| A-02 | Sélectionner une région | Provinces disponibles se mettent à jour (cascade) |
| A-03 | Sélectionner une province | Communes disponibles se mettent à jour (cascade) |
| A-04 | Sélectionner une commune → voir les résultats | Résultats filtrés cohérents avec la sélection géo |
| A-05 | Appliquer un filtre prix (min/max) | Résultats recalculés, filtre combinable avec la géo |
| A-06 | Appliquer un filtre surface (min/max) | Résultats recalculés, cumul avec prix + géo sans réinitialiser les autres filtres |
| A-07 | Ouvrir une fiche parcelle | Toutes les infos s'affichent, aucun champ cassé/vide non géré |
| A-08 | Depuis la fiche, ouvrir la carte | Carte centrée sur la parcelle, cohérente avec la localisation affichée |
| A-09 | Retour arrière (bouton navigateur) | Retombe sur les résultats **avec les filtres encore appliqués** (pas de reset silencieux) |
| A-10 | Ouvrir une autre fiche depuis les résultats | Même comportement que A-07, pas de résidu de l'ancienne fiche affiché |
| A-11 | Cocher 2+ parcelles → comparer | Vue de comparaison s'ouvre avec les bonnes parcelles |
| A-12 | Ajouter une parcelle en favori (sans être connecté) | Comportement cohérent : soit ça déclenche la connexion, soit ça sauvegarde localement puis invite à se connecter — jamais un échec silencieux |
| A-13 | Se connecter | Redirection vers la page initiale (pas de perte du parcours en cours) |
| A-14 | Aller sur le dashboard | Sélections/favoris/comparaisons du parcours précédent bien présents |
| A-15 | Exporter en PDF depuis le dashboard | PDF téléchargeable, contient bien les sélections |

## B. Parcours Vendeur

Accueil → déposer → connexion → formulaire → région/province/commune →
focus carte → polygone → surface → prix → photos → validation →
publication

| # | Étape | Résultat attendu |
|---|---|---|
| B-01 | Accueil → cliquer "Déposer une annonce" | Redirection cohérente (pas de formulaire à l'entrée avant d'avoir exploré, cf. friction minimale) |
| B-02 | Connexion (si pas déjà connecté) | Après connexion, retombe bien sur le dépôt — pas sur l'accueil |
| B-03 | Remplir région → province → commune | Cascade fonctionnelle, la carte se recentre en conséquence (focus auto) |
| B-04 | Dessiner un point OU un polygone sur la carte | Les deux modes fonctionnent, pas de blocage si on change d'avis en cours de dessin |
| B-05 | **Cas piège** : changer de commune après avoir dessiné le polygone | Le polygone existant est géré proprement (reset demandé, ou recentrage sans perte de tracé) — jamais un état incohérent silencieux |
| B-06 | Renseigner surface, prix, statut, accès eau | Validation des champs, messages d'erreur clairs si valeur invalide |
| B-07 | Uploader des photos | Upload multiple fonctionne, ordre des photos cohérent |
| B-08 | **Cas piège** : uploader une photo invalide (mauvais format) | Message d'erreur clair, pas de crash du formulaire |
| B-09 | **Cas piège** : uploader un fichier trop lourd | Message d'erreur clair avec la limite indiquée, pas de blocage silencieux |
| B-10 | Valider le formulaire | Récapitulatif cohérent avant publication |
| B-11 | Publier l'annonce | Annonce visible dans le catalogue immédiatement après publication |
| B-12 | Vérifier le wording du statut foncier | Doit afficher "Informations déclarées par le vendeur" — **jamais** "vérifié" (cf. P0-01a) |
| B-13 | Vérifier le numéro de téléphone affiché côté acheteur | Jamais le numéro brut visible dans le HTML (inspecter le code source) |

## C. Parcours Curieux

Accueil → catalogue → région → carte → plusieurs annonces → comparaison
→ analyser le potentiel → rapport

| # | Étape | Résultat attendu |
|---|---|---|
| C-01 | Accueil → catalogue | Toutes les annonces en ligne visibles, pagination correcte (12/24/48) |
| C-02 | Filtrer par région depuis le catalogue | Résultats cohérents |
| C-03 | Ouvrir la carte, voir les 12 régions | Territoire marocain complet affiché, y compris le sud |
| C-04 | Explorer plusieurs annonces d'affilée | Pas de ralentissement ou de fuite d'état entre deux fiches consultées successivement |
| C-05 | Lancer une comparaison de 2+ annonces | Comparaison lisible, critères alignés |
| C-06 | Cliquer "Analyser le potentiel" sur une fiche | Rapport simulé s'affiche avec la mention "données simulées" bien visible |

## D. Parcours Mobile

Refaire **intégralement** les parcours A, B et C ci-dessus sur téléphone
(pas juste un survol visuel — reproduire les mêmes clics/taps).

| # | Étape | Résultat attendu |
|---|---|---|
| D-01 | Parcours Acheteur (A) complet en mobile | Aucune étape bloquée par la mise en page mobile |
| D-02 | Parcours Vendeur (B) complet en mobile | Formulaire de dépôt utilisable au tactile, upload photo fonctionnel depuis mobile |
| D-03 | Parcours Curieux (C) complet en mobile | Carte et comparaison utilisables au tactile |
| D-04 | Slider "Sélection de terrains" (homepage) | Défilement tactile natif fonctionne sans les flèches (masquées en mobile) |

## E. Scénarios d'erreur (transverses)

Point critique du PDF : réseau/DB qui ne répond pas ne doit **jamais**
donner un chargement infini. Toujours : timeout → message compréhensible
→ possibilité de réessayer.

| # | Cas testé | Résultat attendu |
|---|---|---|
| E-01 | Retour arrière après une action (ex. après avoir posté un message) | Pas de double-soumission, état cohérent |
| E-02 | Double-clic rapide sur un bouton d'action (envoi, publication) | Une seule action déclenchée, pas de doublon créé |
| E-03 | Rafraîchir la page en plein milieu d'un parcours (ex. formulaire de dépôt à moitié rempli) | Comportement prévisible — soit sauvegarde, soit avertissement, jamais une page blanche |
| E-04 | Champ obligatoire laissé vide puis soumission | Message d'erreur clair au bon endroit, pas de crash |
| E-05 | Simuler un réseau lent (throttling navigateur) | Indicateur de chargement visible, pas d'interface figée sans feedback |
| E-06 | Simuler une API indisponible (couper le backend le temps du test) | Message d'erreur clair + bouton "réessayer", jamais de spinner infini |
| E-07 | Recherche avec 0 résultat | Message "aucun terrain trouvé" explicite, pas une page vide sans explication |
| E-08 | Accéder à une page protégée sans être connecté | Redirection propre vers la connexion, avec retour à la bonne page après connexion |
| E-09 | Se déconnecter puis naviguer en arrière | Ne doit pas réafficher une page connectée depuis le cache navigateur |

---

## Comment utiliser ce protocole pendant le sprint

1. **Teste en croisé** : chacun teste le parcours des deux autres, pas
   le sien (on ne voit pas ses propres angles morts).
2. Dès qu'une brique est "à peu près debout", passe la checklist
   correspondante — pas besoin d'attendre la fin du sprint.
3. Bug trouvé → ouvre un ticket dans `registre-bugs.md` avec l'ID du
   scénario (ex. `A-04`) en référence, coche la case `[!]` ici.
4. Une fois un ticket corrigé et re-testé OK, repasse la case à `[x]`.
