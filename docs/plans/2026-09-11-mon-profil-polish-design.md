# Mon profil (/compte) — passe d'amélioration

Date : 2026-09-11
Contexte : suite du chantier des 7 écrans du bundle de handoff design. Pour
Mon profil et Recherche (liste+carte), le contenu verbatim des maquettes
n'est plus disponible (perdu à une compaction de contexte) et rien n'en a
été noté en détail dans la conversation, contrairement à Connexion. Décidé
avec l'utilisatrice : pas de reconstruction à l'aveugle — une passe
d'amélioration avec mon propre jugement produit plutôt qu'une prétendue
fidélité à une maquette que je ne peux plus voir.

## Périmètre

`(espace-perso)/compte/page.tsx` + `components/compte/ProfilCarte.tsx`.
Le rail de navigation partagé (`EspacePersoNav.tsx`, les 3 autres onglets)
n'est pas touché — déjà cohérent entre les 4 pages de l'espace personnel,
aucune raison de le retoucher pour un seul onglet.

## Ce qui est ajouté

**« Membre depuis <mois année> »** — `date_inscription` existe déjà dans
le type `User` (auth-api.ts) et est renvoyé par `UserSerializer`
(accounts/serializers.py) mais n'était utilisé nulle part côté frontend.
Donnée réelle, toujours renseignée (`auto_now_add`), aucune fabrication.

## Ce qui n'est délibérément pas ajouté

**Badge « Compte vérifié »** — `is_verified` existe aussi dans `User` et
semblait à première vue un bon candidat (statut de confiance, cohérent
avec l'esprit "Statut foncier affiché" déjà utilisé ailleurs). Vérifié
côté backend avant d'implémenter : ce champ n'est mis à `True` par aucun
flux d'inscription/connexion réel (email, téléphone OTP, Google) — seuls
`createsuperuser` et les commandes de seed le renseignent
(accounts/models.py:35, seed_parcelles.py, seed_demo.py,
import_scraped_data.py). Pour un utilisateur réel de la marketplace, ce
champ reste `False` en permanence, sans qu'aucune action de sa part ne
puisse jamais le faire passer à `True`. Afficher un badge dessus serait un
signal de confiance qui n'en est pas un — même famille de problème que
« Statut foncier vérifié » corrigé le 11 sept (AKAL ne vérifie aucun
titre). Non ajouté.

## Ce qui reste inchangé

Aucune réintroduction de "Mes annonces"/"Mes recherches" sur cette page :
resteraient une double navigation avec les onglets dédiés
(EspacePersoNav.tsx) — décision déjà actée le 20/08, toujours valable.
Édition avatar/téléphone (ProfilCarte.tsx) : logique intacte, seul
l'agencement autour change légèrement (cf. diff).

## Tests

- `npx vitest run`, `npx tsc --noEmit`, `npx eslint` (fichiers touchés).
- Vérification visuelle (chrome-devtools MCP) avec un compte réel
  (desktop + mobile), avatar/téléphone non touchés fonctionnellement.

## Suite (11 sept, même jour) — le vrai contenu du calque 2a reçu

Le fichier `Refonte du site.dc.html` (bundle complet, option `2a`) a été
reçu après la passe ci-dessus. Contrairement à Connexion, ce calque n'est
pas qu'un habillage : il encode plusieurs fonctionnalités qui n'existent
pas dans le code (vérification téléphone/email, zone de recherche par
défaut, panneau sécurité, profil public) et des toggles qui contredisent
des contraintes déjà actées (canal SMS sur les alertes — hors budget,
cf. mémoire « pas de palier payant »). Décision actée avec l'utilisatrice :
implémenter seulement le sous-ensemble réel, documenter le reste.

### Implémenté

- **Avatar** : pastille crayon superposée (bas-droite de l'avatar) au lieu
  du bouton texte « Ajouter/Changer la photo » — même upload, même
  compression, seul l'habillage du déclencheur change. Nouvelle icône
  `Pencil` dans `Icons.tsx` (chemin SVG repris tel quel du mockup).
- **Nom complet modifiable** — `UserUpdateSerializer` (backend) accepte
  déjà `prenom`/`nom` en PATCH (ajouté à l'origine pour
  `ProfilCompletionGate`), jamais exposé côté `/compte` jusqu'ici. Même
  pattern d'édition en ligne que le téléphone (déjà dans ce fichier).
- **Panneau « Espace vendeur »** (role === VENDEUR uniquement, même garde
  que l'onglet « Mes annonces » d'EspacePersoNav) — nombre réel d'annonces
  EN_LIGNE (`getMesAnnonces()`, déjà utilisé par `/compte/annonces`,
  filtré côté page.tsx Server Component) + liens réels vers
  `/compte/annonces` et `/publier`.
- Regroupement visuel « Identité et contact » (nom, téléphone, email)
  plus proche du calque, sans rien ajouter qui ne soit pas déjà réel.

### Explicitement pas implémenté (documenté, pas oublié)

- **« Téléphone vérifié »** — aucun champ ne suit un état de vérification
  du téléphone (`is_verified` n'est jamais positionné par un flux réel,
  cf. plus haut dans ce document). Une vraie vérification serait
  constructible (l'infra OTP Firebase existe déjà, réutilisée trois fois
  dans le code : Connexion, ProfilCompletionGate) mais c'est une fonctionnalité
  à part entière, pas un polish — hors périmètre de cette passe.
- **« Email — à vérifier / Vérifier »** — aucun flux de vérification email
  n'existe dans le projet.
- **« Ma zone de recherche »** (carte + rayon par défaut, alimentant les
  alertes) — aucun champ « zone par défaut » n'existe sur l'utilisateur ;
  distinct des recherches sauvegardées (`RechercheSauvegardee`, plusieurs
  zones possibles, pas une seule « par défaut »).
- **« Alertes et notifications »** (4 catégories fixes × canal
  email/SMS) — un vrai système d'alertes existe
  (`backend/annonces/alertes.py`) mais est structuré différemment : une
  alerte par recherche sauvegardée (`RechercheSauvegardee.actif`), pas 4
  catégories globales, et **jamais de SMS** (canal email + in-app
  uniquement — décision produit déjà actée, cf. mémoire « pas de palier
  payant » : SMS/WhatsApp nécessiteraient un fournisseur payant à volume
  réel). Reproduire les 4 toggles du mockup afficherait un canal SMS qui
  n'enverrait jamais rien.
- **Panneau « Sécurité »** (mot de passe changé le, appareils connectés,
  suppression de compte) — rien de tout cela n'est suivi ou implémenté
  aujourd'hui.
- **« Voir mon profil public »** — aucune route de profil public
  n'existe (la fiche parcelle affiche le propriétaire inline, pas de
  page dédiée par utilisateur).

### Tests (suite)

- `npx vitest run`, `npx tsc --noEmit`, `npx eslint` (fichiers touchés).
- Vérification visuelle (chrome-devtools MCP) : compte réel avec et sans
  annonces publiées (panneau vendeur conditionnel), édition nom/prénom en
  conditions réelles.
