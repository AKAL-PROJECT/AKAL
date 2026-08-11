import type { StatutFoncier } from "@/types/parcelle";

// Mappe chaque slug de statut foncier (valeur brute API) vers sa classe CSS
// (globals.css), son libellé d'affichage français et une courte définition
// du régime foncier (affichée en tooltip natif au survol — cf. fiche
// parcelle, bloc "Passeport"). Exporté pour être réutilisé là où un <span>
// n'est pas possible (ex. <option> de FiltresSidebar).
export const STATUT_FONCIER_LABEL: Record<
  StatutFoncier,
  { classe: string; label: string; description: string }
> = {
  immatricule: {
    classe: "badge-immatricule",
    label: "Immatriculé",
    description: "Titre foncier immatriculé auprès de la conservation foncière — garantie maximale de propriété.",
  },
  melkia: {
    classe: "badge-melkia",
    label: "Melkia",
    description: "Propriété privée titrée : le vendeur détient un titre de propriété individuel.",
  },
  soulaliya: {
    classe: "badge-soulaliya",
    label: "Soulaliya",
    description: "Terre collective : nécessite l'accord de la communauté (ayants droit) pour toute transaction.",
  },
  guich: {
    classe: "badge-guich",
    label: "Guich",
    description: "Terre d'État concédée à titre d'usage, gérée sous tutelle du domaine de l'État.",
  },
  habous: {
    classe: "badge-habous",
    label: "Habous",
    description: "Bien à statut habous : propriété inaliénable affectée à une fondation religieuse ou caritative.",
  },
};

// Tooltip via l'attribut natif `title` plutôt qu'une bulle custom positionnée
// en absolu : plusieurs points d'usage (CardParcelle) ont un ancêtre
// `overflow: hidden` qui écrêterait une bulle personnalisée.
//
// `statut` nullable (annonces scrapées, cf. types/parcelle.ts) : rien
// n'est rendu plutôt qu'un badge trompeur — jamais inventer un statut
// foncier qui n'a pas été renseigné.
export default function BadgeStatut({ statut }: { statut: StatutFoncier | null }) {
  if (!statut) return null;
  const { classe, label, description } = STATUT_FONCIER_LABEL[statut];
  return (
    <span className={classe} title={description} style={{ cursor: "help" }}>
      {label}
    </span>
  );
}
