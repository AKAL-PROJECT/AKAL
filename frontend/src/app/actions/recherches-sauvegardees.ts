"use server";

// Actions "Recherche sauvegardée" (alertes, 2026-08-19) — sauvegarde des
// critères du catalogue pour être notifié (in-app + email) dès qu'une
// nouvelle annonce correspondante est publiée. Même style de retour
// explicite {ok, error?} que app/actions/annonces.ts : ces actions sont
// appelées directement depuis des composants client (FiltresSidebar.tsx,
// app/compte/recherches/ListeRecherches.tsx), pas via <form action=...>,
// donc pas de useActionState pour porter l'état de succès/erreur.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth-api";
import { ApiError } from "@/lib/api";
import {
  basculerRechercheSauvegardee,
  creerRechercheSauvegardee,
  supprimerRechercheSauvegardee,
} from "@/lib/recherches-sauvegardees-api";

export type ActionRechercheResultat = { ok: true } | { ok: false; error: string };

// Redirige vers /connexion (avec retour sur la page courante) si non
// authentifié — même traitement que toggleFavoriAction (app/actions/favoris.ts) :
// sauvegarder une recherche nécessite un compte, mais rien n'empêche de
// parcourir/filtrer le catalogue sans en avoir un.
export async function creerRechercheSauvegardeeAction(
  nom: string,
  criteres: Record<string, string>,
  next: string,
): Promise<ActionRechercheResultat> {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) {
    redirect(`/connexion?next=${encodeURIComponent(next)}`);
  }
  try {
    await creerRechercheSauvegardee(nom, criteres);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Une erreur est survenue. Réessayez.";
    return { ok: false, error: message };
  }
  revalidatePath("/compte/recherches");
  return { ok: true };
}

export async function supprimerRechercheSauvegardeeAction(id: string): Promise<ActionRechercheResultat> {
  try {
    await supprimerRechercheSauvegardee(id);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Une erreur est survenue. Réessayez.";
    return { ok: false, error: message };
  }
  revalidatePath("/compte/recherches");
  return { ok: true };
}

export async function basculerRechercheSauvegardeeAction(id: string, actif: boolean): Promise<ActionRechercheResultat> {
  try {
    await basculerRechercheSauvegardee(id, actif);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Une erreur est survenue. Réessayez.";
    return { ok: false, error: message };
  }
  revalidatePath("/compte/recherches");
  return { ok: true };
}
