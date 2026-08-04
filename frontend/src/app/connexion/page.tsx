import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import ConnexionScreen from "@/components/connexion/ConnexionScreen";

export const metadata: Metadata = {
  title: "Connexion • AKAL",
  description: "Connectez-vous à AKAL pour explorer, comparer et suivre des parcelles agricoles au Maroc.",
};

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reinitialise?: string }>;
}) {
  const { next, reinitialise } = await searchParams;
  const cheminSuivant = next && next.startsWith("/") ? next : "/compte";

  const utilisateur = await getCurrentUser();
  if (utilisateur) redirect(cheminSuivant);

  return <ConnexionScreen next={cheminSuivant} motDePasseReinitialise={reinitialise === "1"} />;
}
