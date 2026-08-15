import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getParcelleBySlug } from "@/data/parcelles";
import { genererPasseport } from "@/data/passeportAgronomique";
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
    description: "Rapport de démonstration (prototype, données simulées) du potentiel agronomique de cette parcelle.",
  };
}

// Le passeport est généré ici, une seule fois, côté serveur — pas dans le
// composant client : genererPasseport() lit new Date() (horodatage de
// génération, cf. data/passeportAgronomique.ts), le calculer côté client
// aurait risqué un écart serveur/client (hydration mismatch) sans apporter
// aucun bénéfice (rien d'interactif ne dépend de cette valeur).
export default async function PassportAgronomiquePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const parcelle = await getParcelleBySlug(slug);
  if (!parcelle) notFound();

  const passeport = genererPasseport(parcelle);

  return <PasseportAgronomiqueScreen parcelle={parcelle} passeport={passeport} />;
}
