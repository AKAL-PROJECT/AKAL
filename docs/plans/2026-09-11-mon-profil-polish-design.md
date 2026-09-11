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
