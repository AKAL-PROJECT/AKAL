import type { Metadata } from "next";
import ComparateurScreen from "@/components/parcelles/ComparateurScreen";

export const metadata: Metadata = {
  title: "Comparateur • AKAL",
  description: "Comparez côte à côte les parcelles sélectionnées dans le catalogue.",
};

export default function ComparateurPage() {
  return <ComparateurScreen />;
}
