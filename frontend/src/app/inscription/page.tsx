import { redirect } from "next/navigation";

// Inscription et connexion sont unifiées sur /connexion (style Avito) :
// il n'y a plus de distinction entre "créer un compte" et "se connecter" —
// si le numéro/email n'existe pas, le compte est créé automatiquement.
// Cette route est conservée pour ne pas casser les liens existants.
export default async function InscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const params = next ? `?next=${encodeURIComponent(next)}` : "";
  redirect(`/connexion${params}`);
}
