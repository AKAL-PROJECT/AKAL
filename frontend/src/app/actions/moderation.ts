"use server";

// Actions du dashboard modérateur (/moderation, 2026-10-01) — même forme de
// retour {ok, error?} qu'app/actions/annonces.ts, même raison : appelées
// directement depuis un composant client (ModerationScreen.tsx) qui a
// besoin de savoir si l'action a réellement abouti pour mettre à jour son
// état local (retirer la carte de la file) plutôt que de se fier à un
// re-render automatique.

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { decider } from "@/lib/moderation-api";

export type ActionModerationResultat = { ok: true } | { ok: false; error: string };

async function deciderAction(id: string, decision: "valider" | "rejeter"): Promise<ActionModerationResultat> {
  try {
    await decider(id, decision);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Une erreur est survenue. Réessayez.";
    return { ok: false, error: message };
  }
  revalidatePath("/moderation");
  return { ok: true };
}

export async function validerAnnonceAction(id: string): Promise<ActionModerationResultat> {
  return deciderAction(id, "valider");
}

export async function rejeterAnnonceAction(id: string): Promise<ActionModerationResultat> {
  return deciderAction(id, "rejeter");
}
