import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Connexion • AKAL" };

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const cheminSuivant = next && next.startsWith("/") ? next : "/compte";

  const utilisateur = await getCurrentUser();
  if (utilisateur) redirect(cheminSuivant);

  return (
    <div style={{ maxWidth: 420, margin: "64px auto", padding: "0 24px" }}>
      <div className="card" style={{ padding: 32 }}>
        <h1 style={{ fontSize: 24, marginBottom: 24 }}>Connexion</h1>
        <LoginForm next={cheminSuivant} />
        <p style={{ marginTop: 24, fontSize: 14, color: "var(--color-secondaire)" }}>
          Pas encore de compte ?{" "}
          <Link href="/inscription" style={{ color: "var(--color-foret)", fontWeight: 500 }}>
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
  );
}
