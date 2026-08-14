"use server";

// Édition du profil (page /compte, mission « avatar + téléphone ») — appelée
// directement depuis un composant client (ProfilCarte.tsx), pas via
// useActionState : l'appelant a besoin du User à jour immédiatement pour
// rafraîchir avatar/téléphone affichés sans dépendre d'un re-render de page
// (même raison que archiverAnnonceAction, cf. app/actions/annonces.ts).

import { revalidatePath } from "next/cache";
import { ApiError, type FieldErrors } from "@/lib/api";
import { updateProfil } from "@/lib/auth-api";
import type { User } from "@/lib/auth-api";

export type ProfilActionResultat =
  | { ok: true; user: User }
  | { ok: false; error: string; fieldErrors: FieldErrors | null };

export async function mettreAJourProfilAction(formData: FormData): Promise<ProfilActionResultat> {
  try {
    const user = await updateProfil(formData);
    revalidatePath("/compte");
    return { ok: true, user };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    return { ok: false, error: "Une erreur est survenue. Réessayez.", fieldErrors: null };
  }
}
