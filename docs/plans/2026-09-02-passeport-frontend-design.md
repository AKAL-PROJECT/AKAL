# Passeport Agronomique — connexion du frontend au pipeline réel

Date : 2026-09-02
Branche : `finalisation/ux-ui-carte-filtres`
Contexte : commits `2c64825` (pipeline AgriScore + endpoint), `b69df8a` (topo
keyless Open-Meteo + passeport partiel signalé). Clés `CDSE_CLIENT_ID/SECRET`
et `OPENTOPOGRAPHY_API_KEY` provisionnées dans `backend/.env`.

Ce document fige le design validé avant implémentation. Le pipeline backend est
complet et l'endpoint `GET /api/parcelles/<uuid>/passeport/` est en ligne ; il
reste à ce que le frontend le consomme — aujourd'hui `FicheParcelle.tsx` et
`/parcelles/[slug]/passeport/page.tsx` utilisent encore le mock local
`@/data/passeportAgronomique`.

---

## 1. Périmètre

**Dans ce lot :**

- **Backend** — parallélisation des 5 agents dans `orchestrateur._collecter`
  (les appels sont aujourd'hui séquentiels).
- **Front — couche data** — `ParcelleTerrain.id` (UUID Parcelle) ajouté au type
  et mappé ; nouveau `lib/passeport-api.ts` (types DTO + fetch navigateur +
  mapping snake→camel).
- **Front — fiche** — retrait du teaser 4 puces ; la carte « Passeport
  Agronomique » garde titre + CTA, sans aperçu de valeurs. `FicheParcelle` ne
  dépend plus du mock.
- **Front — écran `/passeport`** — coquille rendue serveur (entête,
  identification, carte, méthodologie depuis la `parcelle` déjà chargée) ;
  score + 5 dimensions + cultures récupérés côté client avec skeleton ; états
  422 / erreur / passeport partiel gérés. Réécriture de
  `PasseportAgronomiqueScreen.tsx` avec la maquette validée (onglets + carte
  synthèse).
- **Front — nettoyage** — suppression de `data/passeportAgronomique.ts` +
  `.test.ts` ; `formatDistance` rapatrié dans `lib/format.ts` ;
  `descriptionClimat` supprimé (seul le teaser l'utilisait).

**Hors périmètre (notés pour plus tard) :**

- Encart « Vérifier ce passeport — akal.ma/v/<ref> » + QR de la maquette :
  demande une route de vérification publique, un système de codes courts et de
  la génération QR — feature à part entière.
- Ré-embarquer un `score_courant` dans le DTO annonce (décision séparée, cf.
  audit du 19 août — le passeport à la demande est la vraie source désormais).
- Pondération « saison de croissance » du NDVI (raffinement méthodologique).
- La section « AgriScore » dormante de la fiche (gated par `config/features.ts`)
  — sans rapport avec le Passeport, on n'y touche pas.

---

## 2. Backend — parallélisation des agents

`agriscore/orchestrateur.py::_collecter` interroge les 5 agents en séquence.
Sur un cache froid, ça cumule : ~3–5 s typiques, jusqu'à ~20 s si une source
externe traîne (NDVI = 2 appels HTTP : OAuth + Statistical API).

```python
from concurrent.futures import ThreadPoolExecutor

def _collecter(agents, lat, lon):
    with ThreadPoolExecutor(max_workers=len(agents)) as executor:
        resultats = list(executor.map(lambda a: a.collecter(lat, lon), agents))
    # contrôle des doublons de dimension : inchangé
```

- `executor.map` **préserve l'ordre d'entrée** → le dict `dimensions` du
  passeport reste déterministe (sol, climat, ndvi, topo, acces).
- Thread-safe : `Agent.collecter` est autonome, ne touche pas l'ORM (le flag
  `ConfigurationAgriScore` est lu dans `passeport.py`, avant la collecte), ne
  lève jamais (les coordonnées sont validées en amont dans `generer_passeport`).
  Le cache django-redis et `requests` supportent l'accès concurrent.
- Chaque appel HTTP reste borné par `AGRISCORE_HTTP_TIMEOUT_S` (10 s). Pas de
  deadline globale ajoutée — les timeouts par agent suffisent ; un garde-fou
  global éventuel serait un raffinement ultérieur.
- Gain attendu : cache froid ramené à ~max(agent) ≈ 3–5 s.

`parcelle_id` : **rien à faire côté serveur**. `ParcelleDetailSerializer`
expose déjà `id` dans ses `fields`, donc `AnnonceDetailSerializer.parcelle.id`
est l'UUID Parcelle, déjà présent dans la réponse `/api/annonces/<slug>/`.

**Tests backend** : `test_collecte_parallele_preserve_l_ordre` (5 faux agents,
`dimensions` dans l'ordre canonique) ; `test_collecte_parallele_concurrente`
(3 faux agents dormant 0,2 s, temps total < 0,5 s, marge large). La suite
agriscore existante (141 tests) doit rester verte sans autre retouche.

---

## 3. Front — couche data

### 3.1 `ParcelleTerrain.id`

`types/parcelle.ts` :

```ts
id: string; // UUID de la Parcelle (≠ id de l'annonce) — pour /api/parcelles/<id>/passeport/
```

Mappé dans les deux mappers de `lib/mapAnnonceToParcelle.ts`
(`mapAnnonceToParcelle` liste et `mapAnnonceDetailToParcelle` détail) :
`parcelle: { id: dto.parcelle.id, … }`. `ParcelleListDTO` et `ParcelleDetailDTO`
déclarent déjà `id: string` ; les fixtures de test l'ont déjà.

### 3.2 `lib/passeport-api.ts` — nouveau

Types DTO (miroir snake_case du backend) + type interne camelCase + fetch +
mapping. Même pattern que `getMesAnnonces` (`annonces-api.ts`), qui mappe déjà.

```ts
export type DimensionKey = "sol" | "climat" | "ndvi" | "topo" | "acces";

export type PasseportDimension = {
  statut: "ok" | "indisponible";
  mode: "reel" | "simule";
  sousScore: number | null;
  confiance: number;                                 // 0–1
  valeurs: Record<string, string | number | null>;   // clés snake_case du back, opaques
  source: string;
  resolutionM: number | null;
  poidsNominal: number;
  contribution: number;
};

export type CultureSuggeree = {
  culture: string;
  statut: "compatible" | "sous_condition" | "deconseille";
  raison: string;
  reserve: string;
};

export type Passeport = {
  parcelleId: string;
  genereLe: string;
  mode: "reel" | "simule" | "mixte";
  scoreGlobal: number | null;
  fiabiliteGlobale: number;
  dimensions: Record<DimensionKey, PasseportDimension>;
  dimensionsIndisponibles: DimensionKey[];
  culturesSuggerees: CultureSuggeree[];
  avertissement: string;
};

export class PasseportIndisponibleError extends Error {
  constructor(public readonly raison: "non_geolocalisee" | "introuvable" | "erreur") {
    super(raison);
  }
}

export async function getPasseport(parcelleId: string): Promise<Passeport>;
```

- **`valeurs` reste opaque** (clés snake_case du backend). Le contrat
  `AgentResult` dit explicitement : « les consommateurs itèrent dynamiquement
  dessus, ils ne typent jamais ses clés en dur ». L'écran a un présentateur par
  dimension qui pioche les clés connues avec repli.
- `getPasseport` : **fetch navigateur direct** vers Django
  (`fetch(\`${API_URL}/parcelles/${id}/passeport/\`, { cache: "no-store" })`).
  Endpoint public (`AllowAny`, `authentication_classes = []`), CORS déjà
  configuré (le beacon de vues fait le même appel). Mapping des statuts :
  `422 → PasseportIndisponibleError("non_geolocalisee")`,
  `404 → "introuvable"`, autre `!res.ok → "erreur"`.

**Tests** : `lib/passeport-api.test.ts` — `mapPasseport` (snake→camel, dict
`dimensions`, `culturesSuggerees`, passeport partiel avec
`dimensions_indisponibles`) ; `getPasseport` (fetch mocké : 200 → mappé,
422/404/500 → `PasseportIndisponibleError` avec la bonne `raison`).

---

## 4. Front — fiche

`FicheParcelle.tsx`, chirurgie minime :

- Retirer `import { descriptionClimat, formatDistance, genererPasseport } from "@/data/passeportAgronomique"`.
- Retirer `const passeport = genererPasseport(a)`.
- Retirer le bloc des 4 puces teaser (Sol / Climat / Pente / Route).
- Garder la carte « certificat » (dégradé + bordure dédiée) : icône, titre
  **« Passeport Agronomique »**, sous-titre reformulé « Analyse agronomique —
  sol, climat, végétation, relief, accès » (plus « rapport de démonstration » :
  le `mode` réel/simulé n'est pas connu sans appeler le pipeline), CTA
  **« Analyser le potentiel »** → `/parcelles/<slug>/passeport` inchangé.
- `agriScoreLegende` (helper local) reste — utilisé par la section AgriScore
  dormante.

Résultat : la fiche ne déclenche **aucun** appel pipeline, reste 100 %
statique (SSG).

---

## 5. Front — écran `/passeport`

### 5.1 Route

`app/parcelles/[slug]/passeport/page.tsx` (composant serveur) :
`getParcelleBySlug(slug)` → `notFound()` si null, puis
`<PasseportAgronomiqueScreen parcelle={parcelle} />` (plus de prop `passeport`,
plus de `genererPasseport`). `generateMetadata` inchangé.

### 5.2 `PasseportAgronomiqueScreen.tsx` (`"use client"`)

**Coquille rendue immédiatement depuis `parcelle`** (aucune attente réseau) :

- Fil d'Ariane + « Retour à la fiche ».
- Entête : label « PASSEPORT AGRONOMIQUE », titre (`parcelle.titre`),
  sous-ligne `commune · région · lat/lon · statut foncier` ; boutons
  « Contacter le vendeur » (lien vers `/parcelles/<slug>`) et « Télécharger en
  PDF » (`window.print()`).
- Carte « Identification » + carte Leaflet (`CarteLeafletFiche` existant, zone
  approximative ~500 m — jamais le contour exact).
- Section « Limites et méthodologie » (texte, formulé pour ne plus affirmer
  « toutes les valeurs sont simulées » sans condition — phrasé autour de
  `mode`).

**Au montage** : `getPasseport(parcelle.parcelle.id)` →
machine à états locale `{ statut: "chargement" | "ok" | "indisponible" | "erreur", passeport?, raison? }`.

| État | Rendu |
|---|---|
| `chargement` | skeleton : jauge grisée + barre d'onglets inerte + 5 barres grises |
| `indisponible` (422) | encart « Cette parcelle n'est pas encore géolocalisée précisément — le passeport sera disponible quand sa position sera confirmée. » |
| `erreur` | « Analyse momentanément indisponible. » + bouton **Réessayer** |
| `ok` | contenu complet ci-dessous |

**Contenu `ok` :**

- Badge « DONNÉES SIMULÉES » dans l'entête si `mode !== "reel"`.
- Bandeau d'avertissement si `avertissement` non vide (passeport partiel :
  « relief indisponible… » ; ou mode simulé).
- **Carte synthèse** :
  - `ScoreGauge` — jauge SVG circulaire (`scoreGlobal` sur 100 ; `null` →
    « — » + « Score indisponible »).
  - Verdict : `${bandeScore(scoreGlobal).mot} — ${libelleAccesEau(parcelle.accesEau)}`
    (ex. « Potentiel élevé — terrain irrigable »).
  - Paragraphe de synthèse (dérivé client, cf. §6).
  - Chips `culturesSuggerees` (nom + suffixe selon `statut`).
  - Colonne méta : Superficie, Référence (`parcelleId.slice(0, 8)`), Analyse
    (« Zone ~<zone_tampon> m »), Généré le (`genereLe`), Fiabilité
    (`fiabiliteGlobale` %).
- **Onglets** : Aperçu | Sol | Climat | Végétation | Topographie | Accessibilité
  — tous alimentés par le même appel `getPasseport`.
  - *Aperçu* : 5 `DimensionBar` (libellé + barre sur `sousScore` + valeur
    courte). Dimension `indisponible` → barre grisée + « indisponible ».
  - *Onglet par dimension* : valeurs présentées (cf. `PRESENTATION_DIMENSION`,
    §6) + bloc traçabilité (`source`, `resolutionM`, `confiance` %,
    `dateCollecte`, `statut`).
- **« À retenir avant d'acheter »** : encart dérivé client (forces / faiblesses
  + rappel « analyse de laboratoire recommandée avant un investissement
  important »).

### 5.3 Sous-composants

`components/parcelles/passeport/` :

- `ScoreGauge.tsx` — jauge SVG circulaire ; props `score: number | null`.
- `DimensionBar.tsx` — barre horizontale ; props `label`, `sousScore`,
  `valeur`, `indisponible`.

Le reste (onglets, bloc traçabilité, carte synthèse) reste inline dans
`PasseportAgronomiqueScreen.tsx` pour limiter l'éparpillement.

---

## 6. Helpers de présentation

`lib/passeport-presentation.ts` — fonctions pures, testables, aucun React :

- `bandeScore(score: number | null) → { mot: "élevé" | "moyen" | "limité" | "indisponible", ton }`
  (seuils ≥ 70 / ≥ 45).
- `libelleAccesEau(accesEau) → "terrain irrigable" | "terrain bour" | "terrain mixte" | ""`.
- `synthese(passeport) → string` — **lecture factuelle, pas de prose
  générée** : « N cultures compatibles. Point fort : <dimension>
  (<sousScore>/100). Point de vigilance : <dimension> (<sousScore>/100). »
- `aRetenir(passeport) → string` — dimensions favorables + dimension limitante
  + rappel labo (règle fixe, jamais inventé).
- `PRESENTATION_DIMENSION: Record<DimensionKey, { label, onglet, lignes(valeurs) }>`
  — pioche les clés connues (`ph_eau`, `type_sol`, `pluviometrie_mm`,
  `temperature_moyenne_c`, `ndvi_moyen`, `mois_exploitables`, `altitude_m`,
  `pente_pct`, `distance_route_m`, `route_nom`…) via des helpers `str` / `num` /
  `pct` tolérants (clé absente → « — »). `valeurs` reste opaque ; une clé
  inconnue n'est simplement pas affichée.

---

## 7. Fichiers

**Nouveaux :** `lib/passeport-api.ts` (+ `.test.ts`),
`lib/passeport-presentation.ts` (+ `.test.ts`),
`components/parcelles/passeport/ScoreGauge.tsx` (+ `.test.tsx`),
`components/parcelles/passeport/DimensionBar.tsx` (+ `.test.tsx`).

**Modifiés :** `backend/agriscore/orchestrateur.py`, `backend/agriscore/tests.py`,
`frontend/src/types/parcelle.ts`, `frontend/src/lib/mapAnnonceToParcelle.ts`
(+ `.test.ts`), `frontend/src/lib/format.ts` (`formatDistance` rapatrié),
`frontend/src/components/parcelles/FicheParcelle.tsx`,
`frontend/src/components/parcelles/PasseportAgronomiqueScreen.tsx` (réécriture),
`frontend/src/app/parcelles/[slug]/passeport/page.tsx`.

**Supprimés :** `frontend/src/data/passeportAgronomique.ts`,
`frontend/src/data/passeportAgronomique.test.ts`.

---

## 8. Tests

**Backend** : agriscore 141 → ~143 (ordre préservé + concurrence). Suite
backend complète verte.

**Front :**

- `passeport-api` — `mapPasseport` + `getPasseport` (200 / 422 / 404 / 500).
- `passeport-presentation` — `bandeScore` (bandes), `synthese` / `aRetenir`
  (templating), présentateur tolérant aux clés manquantes.
- `ScoreGauge` / `DimensionBar` — rendu, score `null`, état indisponible.
- `PasseportAgronomiqueScreen` — états (chargement / ok / 422 / erreur), badge
  simulé, bandeau partiel, onglet d'une dimension indisponible.
- `mapAnnonceToParcelle` — `parcelle.id` mappé (liste + détail).
- `FicheParcelle` — les tests existants ne doivent pas casser (vérifier qu'ils
  n'assertent pas sur le teaser).
- `tsc --noEmit` + `eslint` + `npm test` verts, `npm run build` OK.

---

## 9. Séquence d'implémentation suggérée

1. Backend : parallélisation + tests (isolé, mergeable seul).
2. Front data : `ParcelleTerrain.id` + `passeport-api.ts` + tests.
3. Front présentation : `passeport-presentation.ts` + `ScoreGauge` +
   `DimensionBar` + tests.
4. Écran : réécriture de `PasseportAgronomiqueScreen.tsx` + `page.tsx`.
5. Fiche : retrait du teaser.
6. Nettoyage : suppression du mock, `formatDistance` → `lib/format.ts`.
7. Passe finale : `tsc` / `eslint` / `npm test` / `npm run build` / suite
   backend.
