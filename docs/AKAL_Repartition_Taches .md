**AKAL — Registre de prise en charge et répartition des tâches**

# **1\. L'objectif : ce qu'on doit avoir à la fin**

On ne cherche plus à ajouter des fonctionnalités : on stabilise ce qui existe pour que la démo tourne à 100 %, et on prototype la vision (analyse de potentiel) de façon assumée.

**La règle du sprint :**

**STABILISER  →  TESTER  →  CORRIGER  →  DÉMONTRER  →  (puis ENRICHIR)**

À la fin du sprint, on doit pouvoir présenter trois choses distinctes, sans jamais les confondre :

* Ce qui FONCTIONNE aujourd'hui : marketplace \+ carte \+ annonces \+ recherche \+ mise en relation.

* Ce qu'on PROTOTYPE : analyse de potentiel \+ rapports de démonstration (données simulées, mention explicite).

* Ce qui reste à ÉTUDIER : vérification juridique \+ back-office \+ modération \+ enrichissement des données.

# **2\. Principe de répartition**

Répartition par PARCOURS UTILISATEUR (chacun possède un persona de bout en bout), et non par couche technique. Chacun fait le front ET le back de sa verticale. Chacun possède ses propres dossiers : on ne commit jamais dans le dossier d'un autre.

**Les trois personnes :**

* Mégane (PO) — pilotage produit \+ parcours ACHETEUR / catalogue & carte

* Ibrahim — parcours VENDEUR \+ authentification \+ contact \+ maître des migrations/routes

* Destiné — homepage & pages institutionnelles (dev léger) \+ données des rapports \+ QA de tout le site

## **Architecture cible (validée avec M. Baroud)**

*La partie géographique devient une vraie brique de données PostGIS ; la communication devient une décision produit (voir WhatsApp, section 9).*

**SIG-Maroc  (Régions / Provinces / Communes)**

↓

**PostgreSQL \+ PostGIS**

↓

**Django API**

↓

Recherche géographique          Leaflet / Carte

(Région/Province/Commune)      (Polygones \+ parcelles)

**Acheteur  →  Messagerie AKAL  →  Vendeur**

↓

WhatsApp API  (rôle à décider — section 9\)

# **3\. Répartition des tâches par personne**

## **Mégane — Parcours ACHETEUR / Catalogue \+ Carte**

| Domaine | Tâches (front \+ back) | Critère de validation |
| :---- | :---- | :---- |
| **Catalogue** | Liste des parcelles, pagination, choix 12/24/48 annonces par page | Affichage stable, pagination OK |
| **Filtres** | Région → province → commune (cascade dépendante)Prix min/max (champs texte \+ slider)Surface min/max (champs texte \+ slider) | Cascade fonctionnelle, filtres combinables |
| **Carte (PostGIS)** | Maroc complet (sud inclus)12 régions en polygones issus de PostGIS (même sans annonce)Polygones venant des données/API, PAS de données front statiquesFocus auto selon sélection, marqueurs parcelles | 12 régions visibles, territoire complet |
| **API géo hiérarch.** | Région → Province → Commune exposée depuis PostGIS, indépendante des annonces (back) | API testée, géo ≠ annonces |
| **Fiche parcelle** | Page consultation (PROPRIÉTAIRE du fichier fiche) | Toutes infos affichées, retour OK |
| **Comparaison** | Cases à cocher sur catalogue \+ carte comparative (2+ parcelles simultanées) | Comparaison de 2+ parcelles OK |
| **Dashboard \+ PDF** | Mes sélections / favoris / comparaisons \+ export PDF de prospection | PDF téléchargeable avec sélections |
| **Objectif** | **« Un utilisateur peut trouver, explorer, comprendre et comparer une parcelle sans blocage. »** |  |

## **Ibrahim — Parcours VENDEUR \+ Auth \+ Contact**

| Domaine | Tâches (front \+ back) | Critère de validation |
| :---- | :---- | :---- |
| **Authentification** | Google Login (« Continuer avec Google »)Connexion téléphoneRedirections post-connexion, gestion session | Connexion Google rapide, session stable |
| **Friction minimale** | Inscription différée : explorer d'abord, compte au moment du contact/sauvegarde | Pas de gros formulaire à l'entrée |
| **Dépôt d'annonce** | Formulaire (surface, prix, statut, eau, accès, photos)Région → province → commune → focus cartePoint OU polygone, upload photos, validation, publication | Dépôt complet de A à Z sans blocage |
| **Wording statut** | AUCUN « statut vérifié ». Remplacer par « Informations déclarées par le vendeur » | Aucune promesse de vérification |
| **Import SIG-Maroc** | Importer les couches Régions / Provinces-Préfectures / Communes dans PostGIS \+ intégrer le découpage provincial fourni par M. Baroud | Couches importées, provincial intégré |
| **Redirections** | login → page initiale / dépôt / contact ; logout ; retour arrière ; page protégée ; refresh après connexion | Aucune redirection incorrecte ni boucle |
| **Messagerie** | Messagerie interne acheteur ↔ vendeur ↔ réponse ↔ affichage réponse | Envoi/réception sans quitter le parcours |
| **Numéro protégé** | Ne jamais sérialiser le numéro brut ; contact via parcours dédié (back) | Numéro non lisible dans le HTML |
| **Gestion d'erreur** | Timeout \+ message clair si API/DB indisponible (transverse back) | Pas de chargement infini, message \+ réessayer |
| **Migrations / routes** | MAÎTRE unique des migrations Django et des routes partagées | Pas de conflit de migration |
| **Objectif** | **« Un propriétaire peut créer son compte et déposer une annonce complète sans blocage. »** |  |

## **Destiné — Homepage / Pages institutionnelles / Données rapports / QA**

| Domaine | Tâches | Critère de validation |
| :---- | :---- | :---- |
| **Homepage** | Hero \+ message AKAL clairCTA : rechercher / déposer / se connecterSlider « Sélection de terrains »Nettoyage visuel, responsive | Homepage sobre, 2 portes d'entrée claires |
| **Pages institut.** | Comment ça marche (Acheter / Vendre), proposition de valeur, financement (info, PAS de simulateur) | Pages indépendantes, homepage allégée |
| **Données rapports** | Génère 10–15 rapports de démo simulés (script Python isolé) : accès route, pédologie, potentiel agricole/hydrique, cultures | JSON conforme au contrat, profils variés |
| **QA — LIVRABLE** | Rédige le protocole de test (scénarios ci-dessous)Teste EN CROISÉ les parcours des autresDocumente / reproduit / crée les tickets | Registre de bugs alimenté en continu |
| **Objectif** | **« Le produit donne une impression de produit fini, et chaque parcours est testé par quelqu'un qui ne l'a pas codé. »** |  |

*Note : Destiné fait du dev LÉGER et isolé (aucun conflit possible), pour libérer du temps sur le QA que M. Baroud lui a confié. Le dashboard \+ PDF ont été déplacés vers Mégane (prolongement naturel de la comparaison/sélection qu'elle possède déjà).*

# **4\. Propriété des dossiers (anti-collision Git)**

**Règle absolue : on ne commit JAMAIS dans le dossier d'un autre. Si on a besoin d'un point d'accroche chez quelqu'un, on le lui demande.**

| Mégane | Ibrahim | Destiné |
| :---- | :---- | :---- |
| catalogue/ | auth/ | homepage/ |
| map/ | deposit/ | how-it-works/ |
| search/ | messaging/ | buy/  sell/ |
| comparison/ | user-contact/ | value-prop/ |
| parcelle/detail/ (fiche) | migrations/ (maître) | reports-data/ (génération) |
| dashboard/ | urls.py / routes (maître) | qa/ (protocole & tickets) |
| reports-view/ (affichage) |  |  |

## **Fichiers-frontière — un seul propriétaire, les autres demandent**

Ce sont les 4 endroits où deux personnes ont besoin du même fichier. On tranche maintenant qui gagne :

| Fichier / zone | Propriétaire | Règle |
| :---- | :---- | :---- |
| **Composant Carte réutilisable** | Mégane | Ibrahim la consomme en lecture seule pour le dépôt (point/polygone), sans la modifier |
| **Fiche parcelle (detail)** | Mégane | Destiné lui demande d'insérer le point d'accroche du bouton « Analyser le potentiel » |
| **Affichage numéro sur fiche** | Mégane (affiche) / Ibrahim (données) | Ibrahim livre un numéro déjà masqué ; Mégane l'affiche tel quel |
| **Migrations \+ urls.py / routes** | Ibrahim | Chacun lui demande d'ajouter sa migration / sa route (jamais en parallèle) |

# **6\. Contrats d'interface (à figer AVANT de coder)**

Une fois ces formats fixés, chacun code contre le contrat et peut mocker en attendant la livraison de l'autre. C'est ce qui débloque le travail en parallèle.

* GeoJSON régions/provinces/communes (Ibrahim/back → Mégane/carte) : structure des polygones \+ identifiants administratifs.

* Rapport de potentiel (Destiné/données → Mégane/affichage) : shape du JSON — localisation, accès, pédologie, hydrique, potentiel agricole, cultures, synthèse (élevé/moyen/faible).

* Endpoint OAuth (Ibrahim/back → Ibrahim/front) : route \+ payload de retour \+ redirection.

* Contact vendeur / numéro masqué (Ibrahim → Mégane) : forme de la donnée renvoyée (jamais le numéro brut).

# **7\. Discipline Git — pour ne pas se piétiner**

| Personne | Branche |
| :---- | :---- |
| **Mégane** | feat/acheteur-catalogue-carte |
| **Ibrahim** | feat/vendeur-auth-contact |
| **Destiné** | feat/home-reports-qa |

* **Pull \+ rebase sur main CHAQUE MATIN avant de commencer.**

* **Commits petits et fréquents. Jamais un commit fourre-tout de 30 fichiers en fin de journée.**

* Merge dans l'ordre des dépendances : d'abord les contrats (endpoints géo, fixtures rapports), puis les vues qui les consomment.

* Un seul maître des migrations (Ibrahim) : deux migrations en parallèle \= conflit de numérotation garanti.

# **8\. Protocole de QA (Destiné) — tester les PARCOURS, pas les boutons**

Le bug type de M. Baroud : chaque fonction marche seule, mais une succession d'actions casse. On teste donc des enchaînements complets, dès qu'une brique est « à peu près debout » (en continu, pas à la fin).

## **Scénarios à dérouler**

| Persona | Parcours |
| :---- | :---- |
| **Acheteur** | Accueil → recherche → région → province → commune → résultats → filtre prix → filtre surface → fiche → carte → retour → autre fiche → comparer → favori → connexion → dashboard → PDF |
| **Vendeur** | Accueil → déposer → connexion → formulaire → région/province/commune → focus carte → polygone → surface → prix → photos → validation → publication |
| **Curieux** | Accueil → catalogue → région → carte → plusieurs annonces → comparaison → analyser le potentiel → rapport |
| **Mobile** | Refaire les mêmes parcours sur téléphone |
| **Erreurs** | Retour arrière, double-clic, refresh, changement de commune après polygone dessiné, champ vide, photo invalide, fichier trop lourd, réseau lent, API indisponible |

**Point critique — ERROR HANDLING : réseau/DB qui ne répond pas ne doit JAMAIS donner un chargement infini. Toujours : timeout → message compréhensible → possibilité de réessayer.**

# **9\. Registre de prise en charge des remarques**

*Tableau vivant à mettre à jour à chaque réunion. Statuts : À faire / En cours / Fait / À étudier.*

| ID | Fonction | Problème / tâche | Prio | Responsable | Statut | Validation |
| :---- | :---- | :---- | ----- | :---- | :---- | :---- |
| **P0-01a** | Statut (front) | Retirer wording « vérifié » → « Informations déclarées par le vendeur » | **P0** | Mégane | À faire | Wording corrigé |
| **P0-01b** | Statut (back) | Supprimer champ verified=true SI le back le renvoie (sinon barrer) | **P0** | Ibrahim | À vérif. | Champ retiré |
| **P0-02** | Carte | Maroc incomplet (sud manquant) | **P0** | Mégane | À faire | Territoire complet |
| **P0-03** | Carte | 12 régions en polygones (depuis PostGIS) | **P0** | Mégane | À faire | 12 régions visibles |
| **P0-04** | Recherche | Cascade région→prov→commune | **P0** | Mégane | À faire | Parcours fonctionnel |
| **P0-05** | Auth | Google Login absent | **P0** | Ibrahim | À faire | Connexion OK |
| **P0-06** | Erreurs | Chargement infini si API KO → timeout \+ msg. INCLUT le cas 0 annonce (msg « aucun terrain ») | **P0** | Ibrahim | À faire | Timeout \+ msg \+ cas vide |
| **P0-07** | Téléphone | Numéro exposé dans le HTML | **P0** | Ibrahim | À faire | Numéro protégé |
| **P0-08** | Annonce | Focus commune \+ point/polygone | **P0** | Ibrahim | À faire | Focus auto OK |
| **P0-09** | Messagerie | Acheteur → vendeur → réponse → affichage | **P0** | Ibrahim | À faire | Aller-retour sans quitter parcours |
| **P0-10** | Données géo | Import SIG PostGIS \+ découpage provincial (Baroud) | **P0** | Ibrahim | À faire | Régions/prov/communes exposées |
| **P0-11** | Redirections | login→page/dépôt/contact, logout, refresh, page protégée | **P0** | Ibrahim | À faire | Aucune boucle ni erreur |
| **P1-01** | Comparateur | Comparaison cartographique visible | **P1** | Mégane | À faire | 2+ parcelles |
| **P1-02** | Filtres | Min/max texte \+ pagination 12/24/48 | **P1** | Mégane | À faire | Filtres combinables |
| **P1-03** | Dashboard | Sélections \+ PDF de prospection | **P1** | Mégane | À faire | PDF téléchargeable |
| **P1-04** | Homepage | Homepage sobre \+ pages institut. | **P1** | Destiné | À faire | 2 portes d'entrée |
| **P1-05** | Homepage | Slider « Sélection de terrains » → entrée directe catalogue | **P1** | Destiné | À faire | Plusieurs annonces cliquables |
| **P1-06** | Positionnement | Mise en relation directe propriétaire↔acheteur, PAS intermédiaire juridique | **P1** | Destiné | À faire | Wording home \+ comment ça marche |
| **P1-07** | Notif email | Prévenir l'utilisateur d'une nouvelle réponse | **P1** | Ibrahim | À faire | Email reçu à la réponse |
| **P1-08** | Financement | Info uniquement, PAS de simulateur de crédit | **P1** | Destiné | À faire | Page info, zéro simulateur |
| **P2-01** | Analyse | Bouton \+ rapports démo simulés (mention « données simulées ») | **P2** | Destiné+Mégane | Prototype | 10-15 rapports variés |
| **P2-02** | Modération | Étude : classif « terrain agricole / non pertinent », local ou API, coût, précision, faux pos/nég, validation humaine | **P2** | Mégane | À étudier | Étude rendue (pas de dev) |
| **P2-03** | Back-office | Étude vérification annonces/statuts (tech/juri/fin) | **P2** | — | À étudier | Étude faisabilité |
| **P2-04** | WhatsApp | DÉCIDER le rôle : notif / contact / canal principal / complément — puis prototype du choix retenu | **P2** | Mégane | À décider | Décision tracée avant tout dev |

# **10\. Le discours de démo (rappel)**

On ne présente plus « toutes les fonctionnalités développées ». On présente : « une première version fonctionnelle de la marketplace, aujourd'hui en phase de stabilisation avant lancement. »

* Montrer ce qui marche : je cherche → j'explore → je compare → je contacte / je dépose → je publie.

* Montrer la vision : la carte comme outil d'aide à la décision \+ analyse de potentiel (démo assumée).

* Assumer ce qui reste à étudier : juridique, back-office, modération, enrichissement des données.

***Le registre ci-dessus est aussi un livrable en soi : il prouve qu'on a capté toutes les remarques et qu'on les pilote. C'est le pilotage produit que le jury attend de voir.***