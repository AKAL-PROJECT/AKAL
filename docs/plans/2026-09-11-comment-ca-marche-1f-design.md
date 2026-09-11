# Comment ça marche — calque 1f du handoff design

Date : 2026-09-11
Contexte : bundle de handoff design complet reçu (le même fichier que pour
Mon profil/2a). Calque `1f` : « la page devient deux parcours parallèles
(acheter/vendre) au lieu d'une liste d'étapes indifférenciée, avec les
questions foncières traitées en fin de page plutôt qu'en promesses
vagues. »

## État actuel vs mockup

`CommentCaMarcheSection.tsx` a déjà les deux parcours (acheteur/vendeur,
3 étapes chacun, contenu réel et déjà juste) mais en **bascule à onglets**
(un seul visible à la fois) — le mockup les montre **côte à côte,
toujours visibles**. Aucune FAQ foncière n'existe sur la page aujourd'hui.

Un commentaire existant (`AuthMapPanel.tsx`, écrit plus tôt dans la
session) cite déjà « la FAQ de /comment-ca-marche : "AKAL vérifie-t-il les
titres ? Non." » comme si elle existait — erreur de ma part (je m'étais
appuyé sur le contenu du mockup vu plus tôt sans vérifier qu'il était
réellement construit). Ce chantier corrige rétroactivement cette
incohérence en construisant la FAQ.

## Ce qui est implémenté

**Parcours côte à côte** (remplace la bascule à onglets) : deux cartes
toujours visibles, même contenu réel qu'aujourd'hui (Explorez/Comparez/
Contactez, Déposez/Échangez/Vendez — inchangé, déjà exact), carte
vendeur en fond sombre (`var(--color-nuit)`/`var(--color-menthe)`, même
motif que le panneau « Passeport agronomique » de FicheParcelle.tsx et
« Espace vendeur » de ProfilCarte.tsx, cohérence visuelle avec l'existant
plutôt qu'un nouveau motif). Chaque carte porte son propre CTA
(Explorer les parcelles / Déposer une annonce) — remplace le bandeau CTA
générique en bas de page (double emploi une fois les CTA remontés dans
les cartes).

**FAQ foncière** (nouvelle section, 4 questions) — contenu réel, pas
inventé :
- « Melkia »/« Immatriculé » : réutilise **littéralement** les
  descriptions de `STATUT_FONCIER_LABEL` (BadgeStatut.tsx, déjà la
  source de vérité affichée en tooltip sur chaque badge de statut) plutôt
  que de réécrire une définition parallèle qui pourrait diverger.
- AKAL vérifie-t-il les titres ? Non, déclaratif — déjà la position
  affichée partout ailleurs (« Statut foncier affiché », jamais
  « vérifié »).
- Emplacement approximatif : réel — `adresse_approximative` existe déjà
  côté contrat, et la position est « déjà floutée côté serveur pour un
  lecteur non-propriétaire » (cf. commentaire `mapAnnonceToParcelle.ts`).
- Coût de la mise en relation : réel — aucune commission, contact direct
  (déjà le modèle actuel, aucun paiement en ligne dans le produit).

Bandeau disclaimer + CTA final (« AKAL n'est ni notaire, ni agence... »)
en bas de la FAQ, cohérent avec le ton déjà établi ailleurs (FAQ interne
au passeport, mentions légales du dépôt d'annonce).

## Hors périmètre (assumé)

**Hero sombre** — le mockup remplace le hero clair actuel (centré, ton
cohérent avec le reste du site) par un bandeau sombre plein largeur avec
filigrane topo. Non repris : changement purement esthétique sans gain de
contenu, un nouveau motif visuel pour une seule page plutôt qu'une
réutilisation de motifs déjà en place ailleurs (contrairement au reste de
ce chantier). Le hero actuel reste tel quel.

## Tests

- `npx vitest run`, `npx tsc --noEmit`, `npx eslint` (fichiers touchés).
- Vérification visuelle (chrome-devtools MCP) desktop + mobile.
