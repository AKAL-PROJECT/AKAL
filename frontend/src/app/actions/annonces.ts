"use server";

// Actions du dashboard propriétaire (P2 — 2026-07-30) : transitions de
// statut sur une annonce déjà déposée (archiver/marquer vendue/réactiver/
// remettre en vente). Distinct de app/actions/depot-annonce.ts, qui reste le
// domaine du wizard de dépôt (brouillon → en_ligne) — même endpoint PATCH
// sous-jacent, mais contextes d'appel différents. Le graphe des transitions
// valides vit côté backend dans annonces/transitions.py ; ici on se contente
// d'appeler le PATCH et de relayer une éventuelle erreur de validation.

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { patchBrouillon } from "@/lib/annonces-api";
import type { StatutAnnonce } from "@/types/parcelle";

export type ActionStatutResultat = { ok: true } | { ok: false; error: string };

// Appelées directement depuis un composant client (ListeAnnonces.tsx, via la
// modale de confirmation contrôlée — plus de <form action=...> + confirm()
// natif, cf. commentaire de tête de ce composant) : le retour explicite
// {ok, error?} remplace le silence de la version précédente (form action
// sans useActionState) — la modale a besoin de savoir si l'action a
// réellement abouti pour mettre à jour son état local et afficher une
// erreur le cas échéant, plutôt que de se fier à une page qui ne se
// re-render pas toute seule après un appel direct de Server Action.
async function changerStatut(id: string, statut: StatutAnnonce): Promise<ActionStatutResultat> {
  try {
    await patchBrouillon(id, { statut });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Une erreur est survenue. Réessayez.";
    return { ok: false, error: message };
  }
  revalidatePath("/compte/annonces");
  return { ok: true };
}

export async function archiverAnnonceAction(id: string): Promise<ActionStatutResultat> {
  return changerStatut(id, "archivee");
}

export async function marquerVendueAnnonceAction(id: string): Promise<ActionStatutResultat> {
  return changerStatut(id, "vendue");
}

// Réactivation (archivee → en_ligne) ET remise en vente (vendue → en_ligne,
// annonces/transitions.py — 2026-08-07) : même transition cible côté
// backend (statut=en_ligne), donc même action des deux boutons. Le libellé/
// la copie de confirmation, eux, diffèrent selon le statut d'origine — cf.
// ListeAnnonces.tsx.
export async function reactiverAnnonceAction(id: string): Promise<ActionStatutResultat> {
  return changerStatut(id, "en_ligne");
}
