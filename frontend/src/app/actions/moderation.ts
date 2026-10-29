"use server";

// Server Actions du dashboard /moderation et du bouton « Signaler » de la
// fiche — toutes les règles vivent côté backend
// (annonces/moderation_actions.py) ; ici on ne fait que relayer et
// rafraîchir les pages concernées.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth-api";
import { changerStatutVendeur, decider, signalerAnnonce, type Decision } from "@/lib/moderation-api";

export type ActionModerationResultat = { ok: true; message?: string } | { ok: false; error: string };

function erreur(err: unknown): ActionModerationResultat {
  const message = err instanceof ApiError ? err.message : "Une erreur est survenue. Réessayez.";
  return { ok: false, error: message };
}

export async function deciderAction(
  id: string,
  decision: Decision,
  motif = "",
  commentaire = "",
): Promise<ActionModerationResultat> {
  try {
    await decider(id, decision, motif, commentaire);
  } catch (err) {
    return erreur(err);
  }
  revalidatePath("/moderation");
  revalidatePath(`/moderation/${id}`);
  return { ok: true };
}

export async function changerStatutVendeurAction(
  id: string,
  actif: boolean,
  motif = "",
  commentaire = "",
): Promise<ActionModerationResultat> {
  try {
    await changerStatutVendeur(id, actif, motif, commentaire);
  } catch (err) {
    return erreur(err);
  }
  revalidatePath(`/moderation/vendeurs/${id}`);
  return { ok: true };
}

export async function signalerAnnonceAction(
  annonceId: string,
  raison: string,
  commentaire: string,
  next: string,
): Promise<ActionModerationResultat> {
  if (!(await getCurrentUser())) redirect(`/connexion?next=${encodeURIComponent(next)}`);
  try {
    return { ok: true, message: await signalerAnnonce(annonceId, raison, commentaire) };
  } catch (err) {
    return erreur(err);
  }
}
