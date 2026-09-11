# Page d'accueil — hero recherche (écran 2a du handoff design)

Date : 2026-09-11
Contexte : bundle de handoff design reçu (4 fichiers `.dc.html` + README),
7 écrans validés à recréer dans l'environnement Next.js existant. Premier
écran traité : la page d'accueil (`Page d'accueil.dc.html`, calque `2a`),
choisi en premier car il fixe des patterns (filtres réels, réutilisation des
icônes) repris ensuite par les autres écrans.

## Décision de périmètre

7 écrans dans le bundle, chacun comparable en ampleur aux chantiers déjà
menés ce jour (implémentation + tests + PR). Traités un par un plutôt qu'en
une seule PR géante — décision actée avec l'utilisatrice avant de commencer.
Ce document couvre uniquement le hero de la page d'accueil, pas le bandeau
de promesse au-dessus de la nav ni la restructuration complète de la
Navbar (cf. « Hors périmètre » plus bas).

## AgriScore — pas un conflit, déjà résolu par le design lui-même

Le README dit `AGRISCORE_ACTIF = false` et que le score ne doit apparaître
nulle part comme note. Ça a changé plus tôt le même jour (réintégration du
score au catalogue, PR #38) : `AGRISCORE_ACTIF` a été supprimé, le score
s'affiche désormais sur chaque carte. Le README anticipe explicitement ce
cas : *« si le flag est activé un jour, la pastille de repère est le
mauvais endroit : le badge irait sur la carte de résultat, sous le prix »*
— exactement où `AgriScoreResume` est déjà placé dans `CardParcelle.tsx`.
Rien à changer ici.

## Ce qui est implémenté

**Nouveau composant** `components/home/HeroRecherche.tsx` (client — bascule
de mode + géolocalisation ont besoin du navigateur), remplace l'ancien hero
inline de `app/page.tsx`. Le reste de la page (récupération des annonces et
régions) reste un Server Component inchangé.

**Trois modes de recherche**, tous branchés sur de vrais critères déjà
supportés par `AnnonceAPIFilter` (backend/annonces/api_views.py) — aucun
n'est décoratif :

- **Par région** : `<select>` sur les 12 régions officielles (même source
  que `FiltresSidebar`/`CouvertureSection`) → `/parcelles?region=...`.
- **Autour de moi** : géolocalisation navigateur (même API que
  `EtapeLocalisation.tsx`, dépôt d'annonce), puis recherche de la région
  officielle la plus proche par distance euclidienne sur des centroïdes
  approximatifs (ville principale de chaque région — même niveau
  d'approximation que le tri du tiroir de la carte plein écran,
  `carte/page.tsx::distance2`) → `/parcelles?region=<plus_proche>`.
  **Ce n'est pas une recherche par rayon précise** : ni `/parcelles` ni
  `/carte` n'acceptent de bbox arbitraire depuis l'URL aujourd'hui (choix
  déjà en place, documenté dans `app/parcelles/page.tsx` : "rechercher
  cette zone" est une action ponctuelle sur la carte, jamais persistée
  dans un lien partageable). Une vraie recherche par rayon nécessiterait
  d'étendre cette API — hors périmètre de ce chantier, noté ci-dessous.
- **Dessiner sur la carte** : renvoie vers `/carte` (surface/budget
  transmis, `/carte` sait déjà les relire depuis l'URL) où l'utilisateur
  dessine sa zone avec l'outil "rechercher cette zone" déjà existant sur
  `CarteLeaflet.tsx`. Pas de canvas de dessin dupliqué sur le hero.

**Champs communs** : Surface (4 tranches, réel `surface_min`/`surface_max`)
et Budget max (réel `prix_max`).

**Recherches fréquentes** : 4 pilules, chacune un vrai lien vers
`/parcelles?<critère>` (irrigable, budget, surface, statut foncier) — pas
des exemples statiques.

**Stats** (12 régions / 5 statuts fonciers / 5 dimensions) : faits de
structure du produit, pas des compteurs d'inventaire — cohérent avec la
note du README à ce sujet.

**Accessibilité** : réutilisation de la classe `.akal-hero-field` (déjà en
place, focus-visible 2.4.7 — un bug déjà trouvé et corrigé une fois côté
audit a11y Phase 3) sur tous les nouveaux champs à bordure supprimée,
plutôt que de répéter l'oubli.

**Icônes** : réutilisation de `MapPin`/`Search` (`components/icons/Icons.tsx`),
aucun SVG dupliqué.

**Navbar** : ajout de « Comment ça marche » au nav desktop (absent
jusque-là, déjà présent dans le tiroir mobile) — changement minimal,
suit exactement le pattern des deux liens existants (`Explorer`, `Carte`),
même logique de soulignement actif.

## Hors périmètre (assumé, pas oublié)

- **Bandeau de promesse** au-dessus de la nav (« Chaque parcelle est
  publiée avec... ») : nécessiterait de toucher `SiteChrome` (layout
  partagé par toutes les pages) pour un élément spécifique à la home,
  ou de casser le `position: sticky` actuel de la Navbar. Message déjà
  présent dans le sous-titre du hero.
- **Bascule FR / ع** : décorative dans le prototype lui-même (aucun état
  câblé dans son script). Construire une vraie bascule i18n (traductions,
  RTL) est un chantier à part entière, sans infrastructure existante dans
  le dépôt (pas de next-intl, pas de fichiers de traduction). Non ajoutée,
  plutôt que simulée.
- **Recherche par rayon précise** (bbox arbitraire depuis un point) :
  nécessite une décision d'architecture (persister ou non une bbox dans
  l'URL, alors que ce choix a été explicitement écarté ailleurs dans le
  code) — au-delà d'un changement de hero.
- **Repli de la barre de recherche au défilement** : le README le marque
  lui-même comme "absent du prototype, validé verbalement" — pas
  implémenté ici, à discuter séparément.
- **Confiance / Pourquoi AKAL / CTA finaux** : la page actuelle a déjà des
  sections proches en esprit (mêmes 3 arguments de confiance, mêmes CTA) ;
  seul le hero a été retravaillé dans cette passe.

## Tests

- `npx vitest run` → 202/202 (le seul échec observé, `a11y.test.tsx ›
  Connexion`, est un timeout préexistant sous charge, confirmé non lié en
  le relançant seul).
- `npx tsc --noEmit` → aucune erreur.
- `npx eslint` sur les fichiers touchés → aucune erreur.
- Vérification visuelle prévue (chrome-devtools MCP) avant publication de
  la PR.
