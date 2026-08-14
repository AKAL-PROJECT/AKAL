import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { logoutAction } from "@/app/actions/auth";
import ProfilCarte from "@/components/compte/ProfilCarte";

export const metadata = { title: "Mon compte • AKAL" };

export default async function ComptePage() {
  // Ceinture et bretelles avec proxy.ts (qui ne vérifie que la présence du
  // cookie) : ici on vérifie réellement la session auprès du backend.
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/compte");

  return (
    <div style={{ maxWidth: 560, margin: "64px auto", padding: "0 24px" }}>
      <div className="card akal-fade-in" style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Avatar + téléphone : édition en place, cf. ProfilCarte.tsx
            (composant client — persistance réelle via PATCH /auth/me/,
            mission « exploiter les données déjà disponibles »). */}
        <ProfilCarte utilisateurInitial={utilisateur} />

        {utilisateur.role === "VENDEUR" && (
          <Link href="/compte/annonces" className="btn-secondary" style={{ display: "inline-block", textDecoration: "none", textAlign: "center" }}>
            Voir mes annonces →
          </Link>
        )}

        <form action={logoutAction}>
          <button type="submit" className="btn-ghost">Se déconnecter</button>
        </form>
      </div>
    </div>
  );
}
