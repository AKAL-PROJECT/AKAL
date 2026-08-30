"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { obtenirLienWhatsapp } from "@/lib/annonces-api";

// Récupère le lien wa.me d'une annonce (endpoint authentifié — le numéro
// n'est plus dans le DTO public, hardening 2026-08-30). Redirige vers
// /connexion si l'utilisateur n'est pas connecté, plutôt que d'échouer
// silencieusement sur un clic qui semblait fonctionner (même motif que
// toggleFavoriAction, app/actions/favoris.ts).
//
// Retour :
//   - string  → lien wa.me à ouvrir
//   - null    → le vendeur n'a pas renseigné de numéro exploitable
export async function obtenirLienWhatsappAction(
  annonceId: string,
  next: string,
): Promise<string | null> {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) {
    redirect(`/connexion?next=${encodeURIComponent(next)}`);
  }
  return obtenirLienWhatsapp(annonceId);
}
