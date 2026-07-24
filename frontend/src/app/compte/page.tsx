import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { logoutAction } from "@/app/actions/auth";

export const metadata = { title: "Mon compte • AKAL" };

const ROLE_LABELS: Record<string, string> = {
  VENDEUR: "Vendeur",
  ACHETEUR: "Acheteur",
  ADMIN: "Administrateur",
};

export default async function ComptePage() {
  // Ceinture et bretelles avec proxy.ts (qui ne vérifie que la présence du
  // cookie) : ici on vérifie réellement la session auprès du backend.
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/compte");

  return (
    <div style={{ maxWidth: 560, margin: "64px auto", padding: "0 24px" }}>
      <div className="card" style={{ padding: 32 }}>
        <h1 style={{ fontSize: 24, marginBottom: 24 }}>Mon compte</h1>

        <dl style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 12, fontSize: 15 }}>
          <dt style={{ color: "var(--color-secondaire)" }}>Nom</dt>
          <dd>{utilisateur.prenom} {utilisateur.nom}</dd>

          <dt style={{ color: "var(--color-secondaire)" }}>Email</dt>
          <dd>{utilisateur.email}</dd>

          <dt style={{ color: "var(--color-secondaire)" }}>Rôle</dt>
          <dd>{ROLE_LABELS[utilisateur.role] ?? utilisateur.role}</dd>

          {utilisateur.telephone && (
            <>
              <dt style={{ color: "var(--color-secondaire)" }}>Téléphone</dt>
              <dd>{utilisateur.telephone}</dd>
            </>
          )}
        </dl>

        <form action={logoutAction} style={{ marginTop: 32 }}>
          <button type="submit" className="btn-ghost">Se déconnecter</button>
        </form>
      </div>
    </div>
  );
}
