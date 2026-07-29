import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { getFavoris } from "@/lib/favoris-api";
import { FavorisScreen } from "@/components/parcelles/FavorisScreen";

export const metadata: Metadata = {
  title: "Mes favoris • AKAL",
  description: "Les parcelles que vous avez sauvegardées.",
};

export default async function FavorisPage() {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/favoris");

  const parcelles = await getFavoris();

  return <FavorisScreen parcellesInitiales={parcelles} />;
}
