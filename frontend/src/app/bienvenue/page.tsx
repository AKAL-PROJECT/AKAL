import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";

export const metadata = { title: "Bienvenue • AKAL" };

// Écran post-inscription : pas de rôle acheteur/vendeur choisi au signup
// (cf. design doc, addendum du 2026-07-24) — on laisse l'utilisateur
// indiquer son intention du moment plutôt que de le forcer à une identité
// permanente.
export default async function BienvenuePage() {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/bienvenue");

  return (
    <div style={{ maxWidth: 560, margin: "64px auto", padding: "0 24px", textAlign: "center" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Bienvenue sur AKAL, {utilisateur.prenom}.</h1>
      <p style={{ color: "var(--color-secondaire)", marginBottom: 32 }}>Que souhaitez-vous faire ?</p>

      <div style={{ display: "flex", gap: 16, flexDirection: "column" }}>
        <Link href="/parcelles">
          <button className="btn-primary" style={{ width: "100%", padding: "16px 24px", fontSize: 15 }}>
            Explorer les parcelles
          </button>
        </Link>
        <Link href="/publier">
          <button className="btn-secondary" style={{ width: "100%", padding: "16px 24px", fontSize: 15 }}>
            Déposer une annonce
          </button>
        </Link>
      </div>
    </div>
  );
}
