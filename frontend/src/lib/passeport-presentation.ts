// Présentation du Passeport — fonctions pures, aucun React.
//
// Deux rôles :
// 1. traduire les nombres du passeport en libellés (bande de score, verdict,
//    synthèse factuelle, « à retenir ») — jamais de prose inventée, tout est
//    dérivé des `sousScore` / `culturesSuggerees` renvoyés par le back ;
// 2. présenter le dict `valeurs` opaque de chaque dimension (clés snake_case)
//    via `PRESENTATION_DIMENSION` — pioche les clés connues, ignore le reste,
//    tolère l'absence (agent simulé, futur changement de forme back).

import type { AccesEau } from "@/types/parcelle";
import { formatDistance } from "@/lib/format";
import type { DimensionKey, Passeport, PasseportDimension } from "@/lib/passeport-api";

// ── Bande de score ────────────────────────────────────────────────────────

export type TonScore = "positif" | "neutre" | "reserve" | "vide";

export function bandeScore(score: number | null): { mot: string; ton: TonScore } {
  if (score === null) return { mot: "indisponible", ton: "vide" };
  if (score >= 70) return { mot: "élevé", ton: "positif" };
  if (score >= 45) return { mot: "moyen", ton: "neutre" };
  return { mot: "limité", ton: "reserve" };
}

export function libelleAccesEau(accesEau: AccesEau | null): string {
  if (accesEau === "irriguee") return "terrain irrigable";
  if (accesEau === "bour") return "terrain bour (pluvial)";
  if (accesEau === "mixte") return "terrain mixte";
  return "";
}

// « Potentiel élevé — terrain irrigable » (le verdict de la carte synthèse).
export function verdict(score: number | null, accesEau: AccesEau | null): string {
  const { mot, ton } = bandeScore(score);
  const base = ton === "vide" ? "Potentiel indisponible" : `Potentiel ${mot}`;
  const eau = libelleAccesEau(accesEau);
  return eau ? `${base} — ${eau}` : base;
}

// ── Libellés de dimension ────────────────────────────────────────────────

export const LIBELLE_DIMENSION: Record<DimensionKey, { court: string; onglet: string }> = {
  sol: { court: "Sol", onglet: "Sol" },
  climat: { court: "Climat", onglet: "Climat" },
  ndvi: { court: "Végétation", onglet: "Végétation" },
  topo: { court: "Relief", onglet: "Topographie" },
  acces: { court: "Accès", onglet: "Accessibilité" },
};

// ── Synthèse factuelle ───────────────────────────────────────────────────

function dimensionsScorees(p: Passeport): { cle: DimensionKey; sousScore: number }[] {
  return (Object.keys(p.dimensions) as DimensionKey[])
    .map((cle) => ({ cle, dim: p.dimensions[cle] }))
    .filter((x): x is { cle: DimensionKey; dim: PasseportDimension & { sousScore: number } } =>
      x.dim.statut === "ok" && x.dim.sousScore !== null,
    )
    .map(({ cle, dim }) => ({ cle, sousScore: dim.sousScore }))
    .sort((a, b) => b.sousScore - a.sousScore);
}

// « 3 cultures compatibles. Point fort : accès (95/100). Point de vigilance :
//   végétation (20/100). » — chaque chiffre vient du passeport, rien d'ajouté.
export function synthese(p: Passeport): string {
  const nb = p.culturesSuggerees.filter((c) => c.statut === "compatible").length;
  const phrases: string[] = [
    nb === 0
      ? "Aucune culture compatible identifiée à ce stade."
      : `${nb} culture${nb > 1 ? "s" : ""} compatible${nb > 1 ? "s" : ""} identifiée${nb > 1 ? "s" : ""}.`,
  ];

  const scorees = dimensionsScorees(p);
  if (scorees.length >= 1) {
    const f = scorees[0];
    phrases.push(`Point fort : ${LIBELLE_DIMENSION[f.cle].court.toLowerCase()} (${Math.round(f.sousScore)}/100).`);
  }
  if (scorees.length >= 2) {
    const v = scorees[scorees.length - 1];
    phrases.push(`Point de vigilance : ${LIBELLE_DIMENSION[v.cle].court.toLowerCase()} (${Math.round(v.sousScore)}/100).`);
  }
  return phrases.join(" ");
}

// Puces de l'encart « À retenir avant d'acheter » — règles fixes, jamais de
// conseil agronomique inventé.
export function aRetenir(p: Passeport): string[] {
  const scorees = dimensionsScorees(p);
  const nom = (cle: DimensionKey) => LIBELLE_DIMENSION[cle].court.toLowerCase();

  const favorables = scorees.filter((x) => x.sousScore >= 65).map((x) => nom(x.cle));
  const vigilance = scorees.filter((x) => x.sousScore < 45).map((x) => nom(x.cle));

  const puces: string[] = [];
  if (favorables.length) puces.push(`Dimensions favorables : ${favorables.join(", ")}.`);
  if (vigilance.length) puces.push(`Point${vigilance.length > 1 ? "s" : ""} de vigilance : ${vigilance.join(", ")}.`);
  if (p.dimensionsIndisponibles.length) {
    puces.push(`Non évalué : ${p.dimensionsIndisponibles.map(nom).join(", ")}.`);
  }
  puces.push("Une analyse de terrain ou de laboratoire reste recommandée avant un investissement important.");
  return puces;
}

// ── Présentation des `valeurs` par dimension ─────────────────────────────

export type LigneValeur = { label: string; valeur: string };

const ABSENT = "—";

function texte(v: unknown): string {
  return v === null || v === undefined || v === "" ? ABSENT : String(v);
}

function nombre(v: unknown, decimales = 0): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(decimales) : ABSENT;
}

function unite(v: unknown, suffixe: string, decimales = 0): string {
  const n = nombre(v, decimales);
  return n === ABSENT ? ABSENT : `${n} ${suffixe}`;
}

// Une fonction par dimension : (valeurs opaques) → lignes affichables. Les
// lignes dont la valeur vaut ABSENT et qui ne sont pas essentielles sont
// filtrées par l'appelant si besoin ; ici on renvoie tout, l'écran décide.
export const PRESENTATION_DIMENSION: Record<
  DimensionKey,
  (valeurs: Record<string, string | number | null>) => LigneValeur[]
> = {
  sol: (v) => [
    { label: "Type de sol", valeur: texte(v.type_sol) },
    { label: "pH (eau)", valeur: nombre(v.ph_eau, 1) },
    { label: "Argile", valeur: unite(v.argile_pct, "%", 1) },
    { label: "Sable", valeur: unite(v.sable_pct, "%", 1) },
    { label: "Limon", valeur: unite(v.limon_pct, "%", 1) },
  ],
  climat: (v) => [
    { label: "Pluviométrie annuelle", valeur: unite(v.pluviometrie_mm, "mm") },
    { label: "Température moyenne", valeur: unite(v.temperature_moyenne_c, "°C", 1) },
    { label: "Période de référence", valeur: texte(v.periode) },
  ],
  ndvi: (v) => [
    { label: "NDVI moyen", valeur: nombre(v.ndvi_moyen, 2) },
    {
      label: "Mois exploitables",
      valeur:
        v.mois_exploitables === null || v.mois_exploitables === undefined
          ? ABSENT
          : `${v.mois_exploitables} / ${v.mois_total ?? 12}`,
    },
    { label: "Fenêtre analysée", valeur: texte(v.fenetre).replace("..", " → ") },
  ],
  topo: (v) => [
    { label: "Altitude", valeur: unite(v.altitude_m, "m") },
    { label: "Pente moyenne", valeur: unite(v.pente_pct, "%", 1) },
  ],
  acces: (v) => [
    {
      label: "Distance à la route",
      valeur: typeof v.distance_route_m === "number" ? formatDistance(v.distance_route_m) : ABSENT,
    },
    { label: "Voie la plus proche", valeur: texte(v.route_nom) },
  ],
};
