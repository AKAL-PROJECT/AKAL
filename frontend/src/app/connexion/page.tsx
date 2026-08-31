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
  // `reinitialise` (posé par app/actions/auth.ts après un changement de mot
  // de passe réussi, ?reinitialise=1) n'est volontairement pas déstructuré
  // ici : rien ne le consomme aujourd'hui (aucun message de confirmation
  // câblé sur ConnexionScreen) — cf. audit final du 20/08, nettoyage P15,
  // hors périmètre de le construire ici. Le paramètre reste néanmoins dans
  // le type ci-dessous pour documenter que la route l'accepte.
  const { next } = await searchParams;
  const cheminSuivant = next && next.startsWith("/") ? next : "/compte";

  const utilisateur = await getCurrentUser();
  if (utilisateur) redirect(cheminSuivant);

  return <ConnexionScreen next={cheminSuivant} />;
}
