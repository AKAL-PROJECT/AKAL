"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { getFavorisIds, toggleFavori } from "@/lib/favoris-api";

// Ids des annonces favorites de l'utilisateur courant, ou [] si non
// authentifié (pas d'erreur — la page catalogue/fiche reste consultable
// sans compte, seul le fait de sauvegarder un favori nécessite une session).
export async function getFavorisIdsAction(): Promise<string[]> {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) return [];
  return getFavorisIds();
}

// Ajoute/retire une annonce des favoris. Redirige vers /connexion (avec
// retour sur la page courante) si l'utilisateur n'est pas authentifié,
// plutôt que d'échouer silencieusement sur un clic qui semblait fonctionner.
export async function toggleFavoriAction(annonceId: string, next: string): Promise<boolean> {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) {
    redirect(`/connexion?next=${encodeURIComponent(next)}`);
  }
  return toggleFavori(annonceId);
}
