import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { getMesRecherchesSauvegardees } from "@/lib/recherches-sauvegardees-api";
import { EtatVide } from "@/components/EtatVide";
import { ListeRecherches } from "./ListeRecherches";

export const metadata: Metadata = {
  title: "Mes recherches sauvegardées • AKAL",
  description: "Gérez vos alertes — soyez notifié dès qu'une annonce correspond à vos critères.",
};

export default async function MesRecherchesPage() {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/compte/recherches");

  const recherches = await getMesRecherchesSauvegardees();

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Mes recherches sauvegardées</h1>
      <p style={{ fontSize: 14, color: "var(--color-secondaire)", margin: "0 0 24px" }}>
        Vous recevez une notification (dans l&apos;application et par email) dès qu&apos;une nouvelle annonce correspond à l&apos;une de vos alertes.
      </p>

      {recherches.length === 0 ? (
        <EtatVide
          titre="Aucune recherche sauvegardée"
          description="Filtrez le catalogue puis cliquez sur « Recevoir une alerte pour cette recherche » pour en créer une."
          action={
            <Link href="/parcelles" className="btn-secondary" style={{ textDecoration: "none" }}>
              Explorer le catalogue
            </Link>
          }
        />
      ) : (
        <ListeRecherches recherches={recherches} />
      )}
    </div>
  );
}
