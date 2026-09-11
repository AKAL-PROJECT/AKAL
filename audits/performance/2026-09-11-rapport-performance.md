# Rapport de performance — AKAL frontend

Date : 11 septembre 2026
Auteur : mesure outillée (Chrome DevTools MCP — traces réelles + Lighthouse),
pas d'estimation.

## Pourquoi ce rapport

L'audit des objectifs de stage (O2 — qualité front-end) avait relevé un
point précis : des optimisations concrètes existent dans le code
(`next/image`, code-splitting via `next/dynamic`, compression des photos
avant upload, build `output: standalone`), mais **aucune mesure n'avait
jamais été committée** pour objectiver leur effet. Ce rapport corrige ça :
il mesure l'état réel du site en conditions dégradées (mobile, réseau
lent), documente une régression trouvée et corrigée dans la foulée, et
établit une première référence chiffrée.

## Méthodologie

- Outil : Chrome DevTools (MCP `performance_start_trace` pour LCP/CLS ;
  `lighthouse_audit` pour Accessibilité/Bonnes pratiques/SEO).
- Cible : build de **production** réel (`next build && next start`,
  `output: standalone`, `NODE_ENV=production`) tournant dans le conteneur
  Docker `akal-frontend`, données du catalogue de démo servies par le
  backend Django réel — pas un serveur de dev, pas de données mockées.
- Conditions : **mobile émulé** (390×844, DPR 3), **CPU × 4** (ralentissement),
  **réseau "Slow 4G"** — profil volontairement dégradé, représentatif d'un
  visiteur mobile au Maroc hors zone bien couverte, pas du poste de
  développement (desktop, réseau local, qui aurait affiché des chiffres
  bien meilleurs et moins honnêtes).
- **Limite assumée** : les outils MCP disponibles dans cette session ne
  produisent pas le score composite Lighthouse "Performance : NN/100"
  (`lighthouse_audit` exclut explicitement la catégorie performance ; elle
  nécessite `performance_start_trace`, qui donne LCP/CLS/INP bruts plutôt
  qu'un score agrégé). Ce rapport donne donc LCP et CLS mesurés
  directement — les deux métriques explicitement demandées — plutôt qu'un
  score composite non disponible ici.
- **Aucune mesure historique ("avant nos optimisations") n'existe** —
  c'est justement ce que l'audit O2 constatait. Ce rapport établit donc la
  première référence mesurée pour Accueil et Fiche annonce ; pour le
  Catalogue, il documente un vrai avant/après sur UNE régression trouvée
  puis corrigée pendant cette session (cf. plus bas) — chiffres réels,
  reproduits deux fois pour écarter le bruit de mesure.

## Résultat principal : régression trouvée et corrigée (Catalogue)

En mesurant `/parcelles`, la trace a révélé que la photo de la **première**
carte du catalogue — pourtant visible immédiatement à l'écran — était
chargée en `lazy` comme toutes les autres, retardant sa découverte de
1,85 s (insights `LCPDiscovery` + `ImageDelivery`, ~42,7 Ko "gaspillés").
Cause : `next/image` charge en lazy par défaut, et aucune carte n'avait
`priority`, y compris la première.

**Correctif appliqué** (`frontend/src/components/parcelles/CardParcelle.tsx`) :
`priority={index === 0}` sur l'image — précharge uniquement la première
carte (au-dessus du pli), les suivantes restent en lazy comme avant.

| | Avant | Après (run 1) | Après (run 2) |
|---|---|---|---|
| **LCP** | **2515 ms** | **869 ms** | **816 ms** |
| dont délai de découverte de l'image | 1851 ms | — (non flagué) | — (non flagué) |
| CLS | 0,00 | 0,00 | 0,00 |

**Gain : −66 % sur le LCP du catalogue** (2515 ms → ~843 ms de moyenne),
mesuré deux fois pour confirmer la stabilité (869 ms / 816 ms, écart
< 7 %). Les insights `LCPDiscovery` et `ImageDelivery` ont disparu de la
liste des problèmes détectés après correctif — la cause identifiée a
disparu, pas seulement le symptôme.

## État mesuré des autres pages (référence, non modifiées dans cette session)

| Page | LCP | CLS | TTFB | Constat |
|---|---|---|---|---|
| Accueil (`/`) | 960 ms | 0,00 | 330 ms | Correct, dominé par le TTFB (attendu, page riche) |
| Fiche annonce (`/parcelles/<slug>`) | 1368 ms | 0,00 | **956 ms** | TTFB dominant — latence serveur (SSR + appel API), pas un problème d'image. Hors périmètre du correctif de cette session. |

CLS à 0,00 sur les trois pages : aucun saut de mise en page mesuré — cohérent
avec l'usage systématique de conteneurs `aspect-ratio` figés et de
`fill` sur les images (déjà en place, jamais mesuré jusqu'ici).

**Piste identifiée mais non traitée ici** : le TTFB de la fiche annonce
(956 ms sur 1368 ms de LCP, l'insight `DocumentLatency` estime jusqu'à
852 ms d'économie possible sur LCP) — vient du rendu serveur + de l'appel
à l'API Django au chargement de la fiche, pas d'un problème front-end.
Optimisation différente (cache serveur, requête DB), hors périmètre de ce
rapport axé sur le front-end.

## Lighthouse — Accessibilité, Bonnes pratiques, SEO (mobile)

Catégories disponibles indépendamment du score Performance (cf. limite
méthodologique ci-dessus) :

| Page | Accessibilité | Bonnes pratiques | SEO |
|---|---|---|---|
| Accueil | 95 | 77 | 100 |
| Catalogue | 89 | 77 | 100 |

Points relevés (non corrigés dans cette session, hors périmètre O2 perf) :
- Accessibilité (catalogue) : titres pas strictement séquentiels, des
  `<select>` sans `<label>` associé, cibles tactiles trop petites/proches
  par endroits.
- Bonnes pratiques : cookies tiers détectés, des erreurs loggées dans le
  panneau Issues de Chrome DevTools.

## Ce qui reste à faire (hors périmètre de cette mesure)

- Étendre `priority` là où c'est pertinent sur d'autres grilles d'images
  au-dessus du pli (favoris, comparateur) si une mesure future le
  justifie — non fait ici, pas mesuré comme problématique sur les 3 pages
  testées.
- TTFB de la fiche annonce (956 ms) : investiguer côté backend (cache,
  requête DB) — nécessite une mesure backend dédiée, hors périmètre
  front-end de ce rapport.
- Les 3 points Accessibilité/Bonnes pratiques listés ci-dessus.
- Établir ce rapport comme référence : toute PR touchant au chargement
  d'une page clé devrait être mesurée contre ces chiffres, pas seulement
  contre "ça marche visuellement".
