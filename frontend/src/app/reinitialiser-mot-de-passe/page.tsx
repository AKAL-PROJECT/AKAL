import type { Metadata } from "next";
import Link from "next/link";
import ReinitialiserMotDePasseScreen from "@/components/connexion/ReinitialiserMotDePasseScreen";

export const metadata: Metadata = {
  title: "Réinitialiser le mot de passe • AKAL",
  description: "Choisissez un nouveau mot de passe pour votre compte AKAL.",
};

export default async function ReinitialiserMotDePassePage({
  searchParams,
}: {
  searchParams: Promise<{ uid?: string; token?: string }>;
}) {
  const { uid, token } = await searchParams;

  // Lien copié/collé partiellement, ou déjà consommé une fois : pas de quoi
  // faire une page d'erreur générique, juste rediriger vers une nouvelle demande.
  if (!uid || !token) {
    return (
      <div style={{ maxWidth: 440, margin: "96px auto", padding: "0 24px" }}>
        <div className="card akal-fade-in" style={{ padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--color-nuit)", margin: "0 0 12px" }}>
            Lien invalide
          </h1>
          <p style={{ color: "var(--color-secondaire)", margin: "0 0 24px", lineHeight: 1.6 }}>
            Ce lien de réinitialisation est incomplet ou a déjà été utilisé. Demandez-en un nouveau.
          </p>
          <Link href="/mot-de-passe-oublie" className="btn-primary" style={{ textDecoration: "none" }}>
            Redemander un lien
          </Link>
        </div>
      </div>
    );
  }

  return <ReinitialiserMotDePasseScreen uid={uid} token={token} />;
}
