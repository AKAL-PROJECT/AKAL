# Fiche parcelle — calque 1b du handoff design

Date : 2026-09-11
Calque `1b` : « la colonne de droite devient une carte de contact
collante : le propriétaire, le message et l'appel restent visibles
pendant tout le défilement. La carte de situation est dans le flux, pas
en annexe. »

## État actuel vs mockup — l'essentiel existe déjà

Contrairement à Mon profil et Comment ça marche, `FicheParcelle.tsx` est
déjà très proche du calque avant tout changement :

- **Carte de contact collante** — déjà implémentée
  (`.fiche-aside { position: sticky; top: 84px }`, `globals.css:472`),
  responsive (statique sous 900px). Rien à faire.
- **Galerie photos** (1 grande + miniatures, badge « +N photos », visionneuse
  plein écran clavier) — déjà implémentée, `CarrouselPhotos.tsx`, déjà plus
  aboutie que le mockup (visionneuse plein écran que le mockup n'a pas).
- **Bloc Passeport Agronomique** — déjà présent, déjà traité en carte
  "certificat" (dégradé clair + bordure dédiée, cf. commentaire du
  fichier : « la fonctionnalité différenciante d'AKAL ne doit pas se
  fondre dans les cartes plates »). Le mockup le traite en carte sombre
  (fond #1B3A2D) — variante stylistique, pas un manque fonctionnel ;
  non repris pour ne pas prendre le risque de retravailler un composant
  déjà juste et déjà testé pour un gain esthétique seul.
- **Section Localisation** (carte + explication emplacement approximatif)
  — la carte existe déjà (`CarteFiche`/`CarteLeafletFiche`), l'explication
  textuelle et le bouton « Ouvrir dans la carte » du mockup n'existent
  pas encore. Seul vrai delta de ce chantier.

## Ce qui n'est pas repris (données absentes, pas par oubli)

Le mockup affiche un bloc identité vendeur dans la carte de contact
(avatar, « Hassan A. · Propriétaire · membre depuis 2024 »,
« Téléphone vérifié — pas d'intermédiaire »). Vérifié dans
`types/parcelle.ts` : le DTO public `proprietaire` n'expose que
`{ id, telephoneMasque }` — **aucun nom, aucun avatar, aucune date
d'inscription** ne sont envoyés à un visiteur non-propriétaire
(durcissement délibéré du 2026-08-30, fuite de coordonnées déjà corrigée
une fois cette même session sur le pipeline AgriScore). Impossible à
afficher sans revenir sur ce durcissement — hors périmètre d'un polish.
Le badge « Téléphone vérifié » aurait de toute façon été un signal
fabriqué (même constat que Mon profil/#44, `is_verified` jamais
positionné par un flux réel).

## Ce qui est ajouté

Section Localisation : phrase d'explication (« Emplacement approximatif :
le contour exact est communiqué par le vendeur lors du contact » — même
position déjà établie ailleurs, réutilisée dans la FAQ de
/comment-ca-marche, #45) + bouton « Ouvrir dans la carte » →
`/carte?region=<regionCode>` (paramètre réel déjà supporté par
`/carte`, cf. `lireFiltres`). Ce n'est pas un lien direct vers CETTE
parcelle précise sur la carte (aucun paramètre de sélection par id
n'existe sur `/carte` aujourd'hui — construire ce deep-link serait une
vraie fonctionnalité, hors périmètre) : le bouton ouvre la carte
recentrée sur la région, l'approximation la plus honnête possible avec
les capacités réelles actuelles.

## Tests

- `npx vitest run`, `npx tsc --noEmit`, `npx eslint` (fichiers touchés).
- Vérification visuelle (chrome-devtools MCP) desktop + mobile.
