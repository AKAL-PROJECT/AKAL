# Connexion / inscription / mot de passe oublié (écran 2a du handoff design)

Date : 2026-09-11
Contexte : suite du chantier des 7 écrans validés (bundle de handoff design
reçu plus tôt le même jour). Après la page d'accueil (PR #42), deuxième
écran traité : Connexion/inscription — choisi ensuite car le plus
autonome (pas de dépendance aux données du catalogue) et parce que
`MoroccoMap.tsx` existe déjà.

## Avertissement de méthode

Le contenu verbatim du mockup (`Connexion...dc.html`) a été fourni plus tôt
dans la conversation et n'est plus disponible telle quelle au moment
d'implémenter cet écran (perdu à la compaction du contexte). Ce document
reconstruit la décision à partir des notes prises pendant l'analyse initiale
du bundle plutôt que du fichier source lui-même : bascule d'une mise en page
côte-à-côte (formulaire | carte, l'existant) vers une mise en page
plein-écran (carte en fond, carte flottante pour le formulaire), avec
sélection de région au clic sur la carte et une carte flottante secondaire
pour l'accès sans compte. Les détails fins de placement/espacement/couleur
non retrouvables avec certitude sont tranchés ici par défaut sobre (cohérent
avec les tokens et composants déjà en place) plutôt qu'inventés en détail.
Vérification visuelle (chrome-devtools MCP) avant publication de la PR pour
donner une occasion de repérer un écart.

## Ce qui ne change pas (risque business logic)

`ConnexionScreen.tsx` contient la logique réelle d'authentification :
téléphone (Firebase OTP, gestion fine des codes d'erreur), Google OAuth
(formulaire caché + soumission programmatique), email connexion/création
(server actions avec erreurs de champ). **Aucun changement** aux states,
handlers, endpoints, ou à l'arborescence des vues (`accueil`/`otp`/
`identite`) — uniquement l'habillage (le kit de composants autour).

`MotDePasseOublieScreen.tsx` et `ReinitialiserMotDePasseScreen.tsx` restent
inchangés : ce sont déjà des cartes centrées simples, sans dépendance à la
mise en page à deux colonnes de `ConnexionScreen.tsx` — rien à migrer.
Cohérence visuelle avec le nouvel habillage laissée en suivi séparé si
souhaité, hors périmètre ici.

## Ce qui change

**Mise en page** : `.connexion-shell` passe de `flex-direction: row` (deux
colonnes de largeur égale) à un empilement en profondeur — fond carte plein
écran (`AuthMapPanel` réutilisé tel quel comme calque de fond, `position:
absolute inset:0`, desktop ≥820px uniquement, même seuil qu'aujourd'hui) +
carte flottante centrée contenant le formulaire (`.connexion-form-col`
devient cette carte : fond blanc, ombre, coins arrondis, au lieu d'occuper
la moitié de l'écran). Sous 820px : la carte de fond disparaît (déjà le cas
aujourd'hui), le filigrane mobile existant (`.connexion-watermark`) suffit,
la carte flottante devient la page elle-même (comme aujourd'hui en mobile).

**En-tête flottant minimal** : le logo (lien vers `/`, déjà existant) sort
de la carte flottante et devient un bandeau fin en haut de l'écran, par
dessus le fond carte — inchangé dans son contenu (logo + wordmark +
tifinagh), seulement dans sa position.

**Sélection de région au clic** : `MoroccoMap.tsx` gagne un `onClick`
optionnel par région (prop, pas de comportement par défaut — les autres
usages du composant, s'il y en a, ne sont pas affectés). Le clic ne
déclenche **aucune navigation** : la note du 19/08 dans le code
(« tout détour vers le catalogue ferait perdre la saisie en cours ») reste
valable et n'est pas remise en cause. La région cliquée est seulement
retenue en état local (`régionRetenue`) et affichée dans un petit message
sous la carte flottante (« Vous cherchez en <région> ? Vous pourrez
préciser votre recherche une fois connecté. ») — un accusé de réception
visuel, pas une redirection ni une réécriture du paramètre `next` (qui
continue de porter la vraie destination post-connexion, ex. retour vers une
fiche parcelle consultée avant de se connecter — le altérer silencieusement
serait une régression fonctionnelle, pas un habillage).

**Carte flottante secondaire « Sans compte aussi »** : rappel, au-dessus du
fond carte, que consulter le catalogue ne nécessite pas de compte — lien
réel vers `/parcelles` (capacité déjà existante, pas une promesse
décorative).

## Hors périmètre

- Restylage de `MotDePasseOublieScreen.tsx` / `ReinitialiserMotDePasseScreen.tsx`
  pour matcher le nouveau fond carte plein écran (suivi séparé).
- Toute évolution du comportement d'auth lui-même.
- Repositionnement du paramètre `next` en fonction de la région retenue.

## Tests

- `npx vitest run` (frontend).
- `npx tsc --noEmit`.
- `npx eslint` sur les fichiers touchés.
- Vérification visuelle (chrome-devtools MCP) : desktop et mobile,
  interaction connexion email réelle sur l'environnement de dev.
