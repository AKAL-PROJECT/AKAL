import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { getFavoris } from "@/lib/favoris-api";
import { FavorisScreen } from "@/components/parcelles/FavorisScreen";

export const metadata: Metadata = {
  title: "Tableau de bord • AKAL",
  description: "Vos parcelles sélectionnées : comparez-les et téléchargez votre rapport de prospection.",
};

export default async function FavorisPage() {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/favoris");

  const parcelles = await getFavoris();

  return <FavorisScreen parcellesInitiales={parcelles} />;
}
