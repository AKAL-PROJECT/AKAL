import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "Créer un compte • AKAL" };

export default async function InscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const cheminSuivant = next && next.startsWith("/") ? next : "/compte";

  const utilisateur = await getCurrentUser();
  if (utilisateur) redirect(cheminSuivant);

  return (
    <div style={{ maxWidth: 480, margin: "64px auto", padding: "0 24px" }}>
      <div className="card" style={{ padding: 32 }}>
        <h1 style={{ fontSize: 24, marginBottom: 24 }}>Créer un compte</h1>
        <SignupForm next={cheminSuivant} />
        <p style={{ marginTop: 24, fontSize: 14, color: "var(--color-secondaire)" }}>
          Déjà un compte ?{" "}
          <Link href="/connexion" style={{ color: "var(--color-foret)", fontWeight: 500 }}>
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
