import type { StatutAnnonce } from "@/types/parcelle";

// Mappe chaque statut d'annonce (cycle de vie, distinct du statut foncier —
// cf. BadgeStatut.tsx) vers sa classe CSS (globals.css, préfixe
// badge-annonce-*) et son libellé d'affichage français. Exporté pour être
// réutilisé là où un <span> n'est pas possible.
export const STATUT_ANNONCE_LABEL: Record<
  StatutAnnonce,
  { classe: string; label: string }
> = {
  brouillon: { classe: "badge-annonce-brouillon", label: "Brouillon" },
  en_attente: { classe: "badge-annonce-en-attente", label: "En attente" },
  en_ligne: { classe: "badge-annonce-en-ligne", label: "En ligne" },
  archivee: { classe: "badge-annonce-archivee", label: "Archivée" },
  vendue: { classe: "badge-annonce-vendue", label: "Vendue" },
};

export default function BadgeStatutAnnonce({ statut }: { statut: StatutAnnonce }) {
  const { classe, label } = STATUT_ANNONCE_LABEL[statut];
  return <span className={classe}>{label}</span>;
}
