import type { Metadata } from "next";
import MotDePasseOublieScreen from "@/components/connexion/MotDePasseOublieScreen";

export const metadata: Metadata = {
  title: "Mot de passe oublié • AKAL",
  description: "Recevez un lien pour réinitialiser votre mot de passe AKAL.",
};

export default function MotDePasseOubliePage() {
  return <MotDePasseOublieScreen />;
}
