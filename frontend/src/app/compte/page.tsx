import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { logoutAction } from "@/app/actions/auth";
import { Mail, Phone, Shield } from "@/components/icons/Icons";

export const metadata = { title: "Mon compte • AKAL" };

const ROLE_LABELS: Record<string, string> = {
  VENDEUR: "Vendeur",
  ACHETEUR: "Acheteur",
  ADMIN: "Administrateur",
};

const champStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--color-secondaire)" };

export default async function ComptePage() {
  // Ceinture et bretelles avec proxy.ts (qui ne vérifie que la présence du
  // cookie) : ici on vérifie réellement la session auprès du backend.
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/compte");

  const initiales = `${utilisateur.prenom?.[0] ?? ""}${utilisateur.nom?.[0] ?? ""}`.toUpperCase();

  return (
    <div style={{ maxWidth: 560, margin: "64px auto", padding: "0 24px" }}>
      <div className="card akal-fade-in" style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            aria-hidden="true"
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "var(--color-foret)",
              color: "white",
              fontSize: 20,
              fontWeight: 500,
            }}
          >
            {initiales || <Shield size={22} />}
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 500, color: "var(--color-nuit)", margin: 0 }}>
              {utilisateur.prenom} {utilisateur.nom}
            </h1>
            {utilisateur.role && (
              <span
                style={{
                  display: "inline-block",
                  marginTop: 4,
                  padding: "2px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 500,
                  backgroundColor: "var(--color-rosee)",
                  color: "var(--color-foret)",
                }}
              >
                {ROLE_LABELS[utilisateur.role] ?? utilisateur.role}
              </span>
            )}
          </div>
        </div>

        <div style={{ height: 1, backgroundColor: "var(--color-bordure)" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={champStyle}>
            <Mail size={16} style={{ color: "var(--color-foret)", flexShrink: 0 }} />
            <span>{utilisateur.email}</span>
          </div>
          {utilisateur.telephone && (
            <div style={champStyle}>
              <Phone size={16} style={{ color: "var(--color-foret)", flexShrink: 0 }} />
              <span>{utilisateur.telephone}</span>
            </div>
          )}
        </div>

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
