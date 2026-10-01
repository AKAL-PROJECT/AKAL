import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { getQueueModeration } from "@/lib/moderation-api";
import { ModerationScreen } from "@/components/moderation/ModerationScreen";

export const metadata: Metadata = {
  title: "Modération • AKAL",
  description: "File d'attente des annonces signalées par le contrôle automatique, à valider ou rejeter.",
};

// Hors du groupe (espace-perso) (cf. son layout.tsx) : audience différente
// (modérateurs, pas l'espace personnel vendeur/acheteur) — pas de raison de
// partager sa navigation à onglets (Mon profil/Mes annonces/Mes recherches).
export default async function ModerationPage() {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/moderation");
  // Lien jamais affiché à qui n'a pas ce droit (Navbar.tsx), mais un accès
  // direct à l'URL doit rester bloqué — l'API REST (PeutModererAnnonces,
  // backend/annonces/api_views.py) est la vraie barrière, ceci est la garde
  // de page assortie (même rôle que les redirect() de app/(espace-perso)/*).
  if (!utilisateur.peut_moderer) redirect("/");

  const annonces = await getQueueModeration();

  return <ModerationScreen annoncesInitiales={annonces} />;
}
