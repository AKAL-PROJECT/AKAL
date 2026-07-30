"use server";

// Actions du dashboard propriétaire (P2 — 2026-07-30) : transitions de
// statut sur une annonce déjà déposée (archiver/marquer vendue/réactiver).
// Distinct de app/actions/depot-annonce.ts, qui reste le domaine du wizard
// de dépôt (brouillon → en_ligne) — même endpoint PATCH sous-jacent, mais
// contextes d'appel différents. Le graphe des transitions valides vit côté
// backend dans annonces/transitions.py ; ici on se contente d'appeler le
// PATCH et de relayer une éventuelle erreur de validation.

import { revalidatePath } from "next/cache";
import { patchBrouillon } from "@/lib/annonces-api";
import type { StatutAnnonce } from "@/types/parcelle";

// Liées directement à <form action={...}> (même pattern que logoutAction) :
// pas de useActionState ici, donc pas de retour exploitable côté UI. Les
// boutons qui déclenchent ces actions n'apparaissent que sur le statut
// source correct (cf. page.tsx) — un rejet par la machine d'états
// (annonces/transitions.py) ne devrait donc jamais se produire en usage
// normal. En cas d'échec malgré tout, on n'écrit rien : revalidatePath
// réaffichera l'état réel, inchangé, sans message d'erreur dédié pour
// cette première itération.
async function changerStatut(id: string, statut: StatutAnnonce): Promise<void> {
  try {
    await patchBrouillon(id, { statut });
  } catch {
    return;
  }
  revalidatePath("/compte/annonces");
}

export async function archiverAnnonceAction(id: string): Promise<void> {
  return changerStatut(id, "archivee");
}

export async function marquerVendueAnnonceAction(id: string): Promise<void> {
  return changerStatut(id, "vendue");
}

export async function reactiverAnnonceAction(id: string): Promise<void> {
  return changerStatut(id, "en_ligne");
}
