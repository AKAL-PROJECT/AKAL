// Contenu de l'état vide du catalogue, dérivé des filtres actifs.
//
// Quand aucun résultat, on propose d'élargir la recherche d'UN cran dans la
// cascade géographique (commune → province → région → tout) plutôt que de
// tout réinitialiser d'emblée : c'est le geste attendu quand on a affiné
// jusqu'à une commune qui n'a simplement pas encore d'annonce publiée.
//
// Fonction pure (pas de JSX, pas de callbacks) : la page (parcelles/page.tsx)
// mappe `elargir` sur le bon bouton et le bon patch de filtres.

import type { FiltresState, Region } from "@/data/parcelles";

export type NiveauElargissement = "commune" | "province" | "region" | null;

export type EtatVideCatalogue = {
  titre: string;
  description: string;
  // Cran d'élargissement proposé en action principale :
  //   "commune"  → retirer la commune, garder la province
  //   "province" → retirer province + commune, garder la région
  //   "region"   → retirer toute la cascade géo
  //   null       → pas de cascade géo active : proposer "réinitialiser"
  elargir: NiveauElargissement;
  // true si un filtre NON géographique est actif (prix, surface, statut,
  // eau, recherche texte) — la page ajoute alors un lien secondaire
  // "réinitialiser tous les filtres".
  autreFiltreActif: boolean;
};

export function etatVideCatalogue(filtres: FiltresState, regions: Region[]): EtatVideCatalogue {
  const autreFiltreActif =
    filtres.recherche.trim() !== "" ||
    filtres.statutFoncier !== "" ||
    filtres.eau !== "tous" ||
    filtres.prixMin != null ||
    filtres.prixMax != null ||
    filtres.surfaceMin != null ||
    filtres.surfaceMax != null;

  if (filtres.commune) {
    return {
      titre: "Aucune annonce dans cette commune",
      description:
        "Aucun terrain publié ne correspond à cette commune pour l'instant. Élargissez à la province pour voir plus de résultats.",
      elargir: "commune",
      autreFiltreActif,
    };
  }

  if (filtres.province) {
    return {
      titre: "Aucune annonce dans cette province",
      description: "Élargissez la recherche à toute la région, ou ajustez les autres filtres.",
      elargir: "province",
      autreFiltreActif,
    };
  }

  if (filtres.region) {
    const nom = regions.find((r) => r.code === filtres.region)?.nom;
    return {
      titre: nom ? `Aucune annonce dans la région ${nom}` : "Aucune annonce dans cette région",
      description: "Aucun terrain publié ne correspond à cette région avec les filtres actuels.",
      elargir: "region",
      autreFiltreActif,
    };
  }

  return {
    titre: "Aucun terrain ne correspond à votre recherche",
    description: "Essayez d'élargir votre recherche ou de réinitialiser les filtres.",
    elargir: null,
    autreFiltreActif,
  };
}

// Le patch de filtres à appliquer pour un cran d'élargissement donné.
export function patchElargissement(niveau: NiveauElargissement): Partial<FiltresState> {
  switch (niveau) {
    case "commune":
      return { commune: "" };
    case "province":
      return { province: "", commune: "" };
    case "region":
      return { region: "", province: "", commune: "" };
    default:
      return {};
  }
}
