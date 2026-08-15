// Passeport Agronomique — PROTOTYPE (P2-01).
//
// Génère un rapport de démonstration à partir de données 100% SIMULÉES.
// Aucun appel réseau, aucune vraie analyse agronomique — cf. le document de
// référence "Justification du calcul des agents d'enrichissement" pour le
// contrat scientifique/fonctionnel que ce prototype anticipe (5 agents :
// Sol/SoilGrids, Climat/Open-Meteo, NDVI/Sentinel-2, Topographie/Copernicus
// DEM, Accessibilité/OSM).
//
// Seule l'identification de la parcelle (région, surface, coordonnées, ...)
// est réelle — tirée de la Parcelle déjà chargée par la fiche, jamais
// refetchée. Le reste (valeurs par agent) vient d'un des PROFILS ci-dessous,
// choisi de façon déterministe à partir de l'id de la parcelle : jamais
// Math.random() à chaque rendu (le rapport doit rester identique d'un
// export PDF à l'autre pour la même parcelle), et jamais un tirage
// indépendant par champ (le ticket P2-01 §11 exclut explicitement le "random
// pur" — les profils sont prédéfinis et internement cohérents : un sol
// favorable ne cohabite pas avec un potentiel global faible).
//
// Structure de traçabilité (P2-01 §8) : chaque agent est enveloppé dans
// TraceAgent<T>, avec les mêmes clés que l'exemple conceptuel du ticket
// (source, resolution, collected_at, confidence, simulated) — en camelCase
// ici (charte de nommage du projet : le back est en snake_case, la
// conversion se fait dans lib/mapAnnonceToParcelle.ts ; ce module-ci n'a
// pas de back, donc pas de DTO à convertir, mais la FORME reste alignée
// pour qu'un futur vrai endpoint n'ait qu'à être branché sans réécrire les
// composants d'affichage).

import type { Parcelle } from "@/types/parcelle";

export type NiveauConfiance = "elevee" | "moyenne" | "faible";

export const CONFIANCE_LABEL: Record<NiveauConfiance, string> = {
  elevee: "Élevée",
  moyenne: "Moyenne",
  faible: "Faible",
};

// Un indicateur tracé — cf. l'exemple conceptuel du ticket P2-01 §8 :
//   { agent, value, source, resolution, collected_at, confidence, simulated }
export type TraceAgent<T> = {
  valeurs: T;
  source: string; // source théorique future (ex. "SoilGrids / ISRIC")
  resolution: string | null; // null pour les agents sans résolution spatiale (climat, accessibilité)
  periode: string; // équivalent "collected_at" — période ou date simulée
  confiance: NiveauConfiance;
  limitation: string;
  simule: true; // toujours vrai dans ce prototype — jamais présenté comme réel
};

export type ValeursSol = { typeSol: string; ph: number; aptitude: string };
export type ValeursClimat = { temperatureMoyenneC: number; precipitationsAnnuellesMm: number };
export type ValeursNdvi = { moyenne: number; saisonnalite: string };
export type ValeursTopographie = { altitudeM: number; pentePourcent: number };
export type ValeursAccessibilite = { distanceRouteM: number; distanceLocaliteKm: number };

export type ProfilSimule = {
  id: string;
  nom: string;
  niveauGlobal: "eleve" | "moyen" | "faible";
  scoreGlobal: number; // 0-100, cohérent avec niveauGlobal — jamais indépendant des 5 agents
  sol: ValeursSol & { confiance: NiveauConfiance };
  climat: ValeursClimat & { confiance: NiveauConfiance };
  ndvi: ValeursNdvi & { confiance: NiveauConfiance };
  topographie: ValeursTopographie & { confiance: NiveauConfiance };
  accessibilite: ValeursAccessibilite & { confiance: NiveauConfiance };
};

// 12 profils prédéfinis (P2-01 §11 : 10 à 15, cohérents, jamais du random
// pur). Chacun raconte une combinaison plausible plutôt qu'un extrême
// uniforme — un vrai terrain a rarement 5 dimensions toutes excellentes ou
// toutes mauvaises. Valeurs indicatives dans des plages réalistes pour le
// Maroc agricole (pH calcaire fréquent, précipitations 140-550 mm/an selon
// l'étagement climatique, altitudes de plaine à moyenne montagne).
export const PROFILS: ProfilSimule[] = [
  {
    id: "A", nom: "Potentiel élevé — terrain irrigable", niveauGlobal: "eleve", scoreGlobal: 88,
    sol: { typeSol: "Argilo-limoneux", ph: 6.8, aptitude: "Favorable", confiance: "elevee" },
    climat: { temperatureMoyenneC: 19, precipitationsAnnuellesMm: 480, confiance: "elevee" },
    ndvi: { moyenne: 0.68, saisonnalite: "Croissance stable, pic printanier marqué (mars-avril)", confiance: "moyenne" },
    topographie: { altitudeM: 340, pentePourcent: 2, confiance: "elevee" },
    accessibilite: { distanceRouteM: 250, distanceLocaliteKm: 3.1, confiance: "moyenne" },
  },
  {
    id: "B", nom: "Bon potentiel, accès limité", niveauGlobal: "eleve", scoreGlobal: 74,
    sol: { typeSol: "Limoneux", ph: 7.2, aptitude: "Favorable", confiance: "elevee" },
    climat: { temperatureMoyenneC: 21, precipitationsAnnuellesMm: 380, confiance: "elevee" },
    ndvi: { moyenne: 0.55, saisonnalite: "Végétation modérée, creux estival marqué", confiance: "moyenne" },
    topographie: { altitudeM: 520, pentePourcent: 6, confiance: "elevee" },
    accessibilite: { distanceRouteM: 1_800, distanceLocaliteKm: 7.4, confiance: "moyenne" },
  },
  {
    id: "C", nom: "Sol favorable, climat aride", niveauGlobal: "moyen", scoreGlobal: 61,
    sol: { typeSol: "Sablo-limoneux", ph: 7.6, aptitude: "Favorable sous irrigation", confiance: "elevee" },
    climat: { temperatureMoyenneC: 24, precipitationsAnnuellesMm: 180, confiance: "elevee" },
    ndvi: { moyenne: 0.32, saisonnalite: "Végétation clairsemée, forte dépendance à l'irrigation", confiance: "moyenne" },
    topographie: { altitudeM: 180, pentePourcent: 1, confiance: "elevee" },
    accessibilite: { distanceRouteM: 600, distanceLocaliteKm: 4.5, confiance: "moyenne" },
  },
  {
    id: "D", nom: "Potentiel moyen équilibré", niveauGlobal: "moyen", scoreGlobal: 58,
    sol: { typeSol: "Argileux", ph: 7.0, aptitude: "Moyenne", confiance: "moyenne" },
    climat: { temperatureMoyenneC: 18, precipitationsAnnuellesMm: 320, confiance: "moyenne" },
    ndvi: { moyenne: 0.45, saisonnalite: "Saisonnalité marquée, reprise en automne", confiance: "moyenne" },
    topographie: { altitudeM: 410, pentePourcent: 4, confiance: "moyenne" },
    accessibilite: { distanceRouteM: 900, distanceLocaliteKm: 5.2, confiance: "moyenne" },
  },
  {
    id: "E", nom: "Sol pauvre, bien desservi", niveauGlobal: "faible", scoreGlobal: 47,
    sol: { typeSol: "Sableux", ph: 8.1, aptitude: "Limitée (drainage rapide)", confiance: "moyenne" },
    climat: { temperatureMoyenneC: 20, precipitationsAnnuellesMm: 290, confiance: "moyenne" },
    ndvi: { moyenne: 0.28, saisonnalite: "Couverture végétale faible et irrégulière", confiance: "faible" },
    topographie: { altitudeM: 95, pentePourcent: 1, confiance: "elevee" },
    accessibilite: { distanceRouteM: 150, distanceLocaliteKm: 1.8, confiance: "elevee" },
  },
  {
    id: "F", nom: "Relief accidenté, sol correct", niveauGlobal: "moyen", scoreGlobal: 52,
    sol: { typeSol: "Limono-argileux", ph: 6.5, aptitude: "Correcte", confiance: "moyenne" },
    climat: { temperatureMoyenneC: 15, precipitationsAnnuellesMm: 550, confiance: "elevee" },
    ndvi: { moyenne: 0.58, saisonnalite: "Bonne couverture en altitude, sensible au gel hivernal", confiance: "moyenne" },
    topographie: { altitudeM: 980, pentePourcent: 14, confiance: "elevee" },
    accessibilite: { distanceRouteM: 3_200, distanceLocaliteKm: 9.6, confiance: "faible" },
  },
  {
    id: "G", nom: "Potentiel faible, zone reculée", niveauGlobal: "faible", scoreGlobal: 33,
    sol: { typeSol: "Caillouteux", ph: 8.3, aptitude: "Faible", confiance: "moyenne" },
    climat: { temperatureMoyenneC: 26, precipitationsAnnuellesMm: 140, confiance: "moyenne" },
    ndvi: { moyenne: 0.18, saisonnalite: "Végétation clairsemée toute l'année", confiance: "moyenne" },
    topographie: { altitudeM: 210, pentePourcent: 3, confiance: "elevee" },
    accessibilite: { distanceRouteM: 4_800, distanceLocaliteKm: 14.2, confiance: "faible" },
  },
  {
    id: "H", nom: "Bonne végétation, sol argileux lourd", niveauGlobal: "eleve", scoreGlobal: 65,
    sol: { typeSol: "Argileux lourd (vertisol)", ph: 7.4, aptitude: "Bonne rétention, drainage à surveiller", confiance: "moyenne" },
    climat: { temperatureMoyenneC: 17, precipitationsAnnuellesMm: 510, confiance: "elevee" },
    ndvi: { moyenne: 0.71, saisonnalite: "Couverture dense, pic en mai", confiance: "elevee" },
    topographie: { altitudeM: 290, pentePourcent: 2, confiance: "elevee" },
    accessibilite: { distanceRouteM: 1_100, distanceLocaliteKm: 6.0, confiance: "moyenne" },
  },
  {
    id: "I", nom: "Climat favorable, accès difficile", niveauGlobal: "moyen", scoreGlobal: 55,
    sol: { typeSol: "Limoneux", ph: 6.9, aptitude: "Favorable", confiance: "moyenne" },
    climat: { temperatureMoyenneC: 19, precipitationsAnnuellesMm: 460, confiance: "elevee" },
    ndvi: { moyenne: 0.50, saisonnalite: "Croissance régulière", confiance: "moyenne" },
    topographie: { altitudeM: 650, pentePourcent: 9, confiance: "moyenne" },
    accessibilite: { distanceRouteM: 5_500, distanceLocaliteKm: 12.0, confiance: "faible" },
  },
  {
    id: "J", nom: "Potentiel limité, drainage à surveiller", niveauGlobal: "faible", scoreGlobal: 40,
    sol: { typeSol: "Argileux compact", ph: 7.8, aptitude: "Limitée (engorgement possible)", confiance: "moyenne" },
    climat: { temperatureMoyenneC: 22, precipitationsAnnuellesMm: 240, confiance: "moyenne" },
    ndvi: { moyenne: 0.30, saisonnalite: "Stress hydrique visible en été", confiance: "moyenne" },
    topographie: { altitudeM: 60, pentePourcent: 1, confiance: "elevee" },
    accessibilite: { distanceRouteM: 700, distanceLocaliteKm: 4.0, confiance: "moyenne" },
  },
  {
    id: "K", nom: "Terrain plat, accès excellent, sol moyen", niveauGlobal: "moyen", scoreGlobal: 63,
    sol: { typeSol: "Limono-sableux", ph: 7.1, aptitude: "Moyenne", confiance: "moyenne" },
    climat: { temperatureMoyenneC: 20, precipitationsAnnuellesMm: 350, confiance: "moyenne" },
    ndvi: { moyenne: 0.42, saisonnalite: "Végétation modérée, stable", confiance: "moyenne" },
    topographie: { altitudeM: 130, pentePourcent: 1, confiance: "elevee" },
    accessibilite: { distanceRouteM: 100, distanceLocaliteKm: 1.2, confiance: "elevee" },
  },
  {
    id: "L", nom: "Potentiel élevé toutes dimensions", niveauGlobal: "eleve", scoreGlobal: 92,
    sol: { typeSol: "Limoneux profond", ph: 6.7, aptitude: "Excellente", confiance: "elevee" },
    climat: { temperatureMoyenneC: 18, precipitationsAnnuellesMm: 520, confiance: "elevee" },
    ndvi: { moyenne: 0.74, saisonnalite: "Couverture dense et stable toute l'année", confiance: "elevee" },
    topographie: { altitudeM: 220, pentePourcent: 2, confiance: "elevee" },
    accessibilite: { distanceRouteM: 200, distanceLocaliteKm: 2.5, confiance: "elevee" },
  },
];

// Hash déterministe (djb2) — jamais Math.random() : la même parcelle doit
// toujours retomber sur le même profil (stabilité entre deux visites, et
// entre l'écran et son export PDF).
function hashDeterministe(texte: string): number {
  let h = 5381;
  for (let i = 0; i < texte.length; i++) {
    h = (h * 33) ^ texte.charCodeAt(i);
  }
  return Math.abs(h);
}

export function choisirProfil(parcelleId: string): ProfilSimule {
  const index = hashDeterministe(parcelleId) % PROFILS.length;
  return PROFILS[index];
}

// ── Identification (données réelles uniquement — P2-01 §1) ─────────────────
export type IdentificationParcelle = {
  reference: string; // id (troncature lisible) — pas de numéro de dossier séparé, n'existe pas dans le modèle
  titre: string;
  region: string;
  province: string | null;
  commune: string | null;
  surfaceHa: number;
  latitude: number;
  longitude: number;
  contour: { latitude: number; longitude: number }[] | null;
};

export type PasseportAgronomique = {
  identification: IdentificationParcelle;
  profil: ProfilSimule;
  sol: TraceAgent<ValeursSol>;
  climat: TraceAgent<ValeursClimat>;
  ndvi: TraceAgent<ValeursNdvi>;
  topographie: TraceAgent<ValeursTopographie>;
  accessibilite: TraceAgent<ValeursAccessibilite>;
  genereLe: string; // ISO — horodatage de GÉNÉRATION du rapport de démo, pas une vraie date de collecte
};

const PERIODE_CLIMAT_SIMULEE = "2015–2024 (réanalyse théorique)";
const DATE_SIMULEE = "Donnée simulée — aucune date de collecte réelle";

export function genererPasseport(parcelle: Parcelle): PasseportAgronomique {
  const profil = choisirProfil(parcelle.id);
  const p = parcelle.parcelle;

  return {
    identification: {
      reference: parcelle.id.slice(0, 8).toUpperCase(),
      titre: parcelle.titre,
      region: p.regionNom,
      province: p.province,
      commune: p.commune,
      surfaceHa: p.surface,
      latitude: p.latitude,
      longitude: p.longitude,
      contour: p.contour, // toujours null aujourd'hui, cf. types/parcelle.ts
    },
    profil,
    sol: {
      valeurs: { typeSol: profil.sol.typeSol, ph: profil.sol.ph, aptitude: profil.sol.aptitude },
      source: "SoilGrids / ISRIC",
      resolution: "250 m",
      periode: DATE_SIMULEE,
      confiance: profil.sol.confiance,
      limitation: "Résolution 250 m : ne distingue pas les variations de sol à l'échelle de la parcelle.",
      simule: true,
    },
    climat: {
      valeurs: { temperatureMoyenneC: profil.climat.temperatureMoyenneC, precipitationsAnnuellesMm: profil.climat.precipitationsAnnuellesMm },
      source: "Open-Meteo",
      resolution: null,
      periode: PERIODE_CLIMAT_SIMULEE,
      confiance: profil.climat.confiance,
      limitation: "Moyennes de réanalyse régionale, pas une station météo sur site.",
      simule: true,
    },
    ndvi: {
      valeurs: { moyenne: profil.ndvi.moyenne, saisonnalite: profil.ndvi.saisonnalite },
      source: "Sentinel-2 / Copernicus",
      resolution: "10 m",
      periode: "Profil simulé sur 12 mois",
      confiance: profil.ndvi.confiance,
      limitation: "Sensible à la couverture nuageuse et à la nature de la culture en place au moment de la prise de vue.",
      simule: true,
    },
    topographie: {
      valeurs: { altitudeM: profil.topographie.altitudeM, pentePourcent: profil.topographie.pentePourcent },
      source: "Copernicus DEM / OpenTopography",
      resolution: "30 m",
      periode: DATE_SIMULEE,
      confiance: profil.topographie.confiance,
      limitation: "Résolution 30 m : lisse les variations de relief fines (terrasses, talus).",
      simule: true,
    },
    accessibilite: {
      valeurs: { distanceRouteM: profil.accessibilite.distanceRouteM, distanceLocaliteKm: profil.accessibilite.distanceLocaliteKm },
      source: "OpenStreetMap / Overpass",
      resolution: null,
      periode: DATE_SIMULEE,
      confiance: profil.accessibilite.confiance,
      // Rappel explicite du ticket P2-01 : distance à vol d'oiseau, jamais
      // une distance ou durée routière réelle — ne pas la présenter comme telle.
      limitation: "Distance à vol d'oiseau, pas un temps ou une distance de trajet routier réel.",
      simule: true,
    },
    genereLe: new Date().toISOString(),
  };
}
