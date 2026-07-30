import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import InscriptionScreen from "@/components/inscription/InscriptionScreen";

export const metadata = {
  title: "Créer un compte • AKAL",
  description: "Créez votre compte AKAL pour explorer, comparer et suivre des parcelles agricoles au Maroc.",
};

export default async function InscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  const utilisateur = await getCurrentUser();
  if (utilisateur) redirect(next && next.startsWith("/") ? next : "/compte");

  return <InscriptionScreen />;
}
