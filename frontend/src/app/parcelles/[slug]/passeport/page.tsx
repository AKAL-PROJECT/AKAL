import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getParcelleBySlug } from "@/data/parcelles";
import PasseportAgronomiqueScreen from "@/components/parcelles/PasseportAgronomiqueScreen";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const parcelle = await getParcelleBySlug(slug);
  if (!parcelle) return { title: "AKAL" };
  return {
    title: `Passeport Agronomique — ${parcelle.titre} — AKAL`,
    description:
      "Évaluation agronomique de la parcelle : sol, climat, végétation, relief et accès, agrégés en un potentiel global.",
  };
}

// La coquille (identification, carte, méthodologie) est rendue côté serveur
// depuis la parcelle déjà chargée. Le passeport lui-même — jusqu'à 5 appels
// vers des API externes — est récupéré côté client par le composant, avec un
// skeleton : le rendre ici bloquerait la page plusieurs secondes sur un
// cache froid, sans bénéfice SEO (le contenu est une analyse, pas du
// référencement).
export default async function PasseportAgronomiquePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const parcelle = await getParcelleBySlug(slug);
  if (!parcelle) notFound();

  return <PasseportAgronomiqueScreen parcelle={parcelle} />;
}
