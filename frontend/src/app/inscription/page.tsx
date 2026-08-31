import { permanentRedirect } from "next/navigation";

// Inscription et connexion sont unifiées sur /connexion (style Avito) :
// il n'y a plus de distinction entre "créer un compte" et "se connecter" —
// si le numéro/email n'existe pas, le compte est créé automatiquement.
// Cette route est conservée pour ne pas casser les liens existants.
// `permanentRedirect` (308, pas `redirect` qui répond en 307) : la fusion
// des deux routes est une décision d'architecture définitive, pas un
// détour temporaire (audit UX du 19/08 — cf. suppression du composant
// InscriptionScreen.tsx, qui n'était plus rendu par aucune route depuis
// cette même fusion, jamais nettoyé jusqu'ici).
export default async function InscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const params = next ? `?next=${encodeURIComponent(next)}` : "";
  permanentRedirect(`/connexion${params}`);
}
