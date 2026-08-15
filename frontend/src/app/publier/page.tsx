import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { getBrouillon } from "@/lib/annonces-api";
import { DepotAnnonceWizard } from "@/components/depot-annonce/DepotAnnonceWizard";
import ProfilCompletionGate from "@/components/compte/ProfilCompletionGate";
import type { AnnonceEcriture } from "@/types/depot-annonce";

export const metadata: Metadata = {
  title: "Déposer une annonce • AKAL",
  description: "Déposez votre parcelle en 3 étapes : informations, localisation, photos.",
};

// ?id=<uuid> permet de reprendre un brouillon après avoir quitté la page —
// pas de brouillon en localStorage (décision F03) : seule l'id transite par
// l'URL, les données elles-mêmes sont toujours relues depuis le backend.
export default async function PublierPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/publier");

  const { id } = await searchParams;
  let annonceInitiale: AnnonceEcriture | null = null;
  if (id) {
    try {
      annonceInitiale = await getBrouillon(id);
    } catch {
      // Brouillon inexistant, déjà publié ailleurs, ou appartenant à un
      // autre utilisateur (l'endpoint scope déjà sur le propriétaire) :
      // on repart simplement d'un formulaire vierge plutôt que de planter.
      annonceInitiale = null;
    }
  }

  return (
    <ProfilCompletionGate user={utilisateur}>
      <DepotAnnonceWizard annonceInitiale={annonceInitiale} />
    </ProfilCompletionGate>
  );
}

