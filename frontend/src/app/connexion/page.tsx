import type { Metadata } from "next";
import ConnexionScreen from "@/components/connexion/ConnexionScreen";

export const metadata: Metadata = {
  title: "Connexion • AKAL",
  description: "Connectez-vous à AKAL pour explorer, comparer et suivre des parcelles agricoles au Maroc.",
};

export default function ConnexionPage() {
  return <ConnexionScreen />;
}
