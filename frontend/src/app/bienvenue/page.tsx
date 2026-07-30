import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { Search, FileText } from "@/components/icons/Icons";

export const metadata = { title: "Bienvenue • AKAL" };

// Écran post-inscription : pas de rôle acheteur/vendeur choisi au signup
// (cf. design doc, addendum du 2026-07-24) — on laisse l'utilisateur
// indiquer son intention du moment plutôt que de le forcer à une identité
// permanente.
export default async function BienvenuePage() {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/bienvenue");

  return (
    <div style={{ maxWidth: 480, margin: "72px auto", padding: "0 24px" }}>
      <div className="card akal-fade-in" style={{ padding: 40, textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/uploads/akal-logo.svg" alt="" style={{ width: 44, height: 44, margin: "0 auto 20px" }} />

        <h1 style={{ fontSize: 24, fontWeight: 500, color: "var(--color-nuit)", margin: "0 0 8px" }}>
          Bienvenue sur AKAL, {utilisateur.prenom}.
        </h1>
        <p style={{ color: "var(--color-secondaire)", margin: "0 0 32px" }}>Que souhaitez-vous faire ?</p>

        <div style={{ display: "flex", gap: 12, flexDirection: "column" }}>
          <Link href="/parcelles" style={{ textDecoration: "none" }}>
            <button
              className="btn-primary"
              style={{ width: "100%", padding: "16px 24px", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <Search size={16} />
              Explorer les parcelles
            </button>
          </Link>
          <Link href="/publier" style={{ textDecoration: "none" }}>
            <button
              className="btn-secondary"
              style={{ width: "100%", padding: "16px 24px", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <FileText size={16} />
              Déposer une annonce
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
