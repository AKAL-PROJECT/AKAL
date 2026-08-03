import type { Metadata } from "next";
import Link from "next/link";
import { EtatVide } from "@/components/EtatVide";

export const metadata: Metadata = {
  title: "Page introuvable • AKAL",
  description: "Cette page n'existe pas ou n'est plus disponible.",
};

export default function NotFound() {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 20px 100px" }}>
      <EtatVide
        titre="Page introuvable"
        description="Le lien est peut-être obsolète, ou l'annonce n'est plus en ligne (vendue, archivée ou retirée par son propriétaire)."
        action={
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
            <Link href="/" className="btn-secondary" style={{ textDecoration: "none" }}>
              Retour à l&apos;accueil
            </Link>
            <Link href="/parcelles" className="btn-primary" style={{ textDecoration: "none" }}>
              Explorer les parcelles
            </Link>
          </div>
        }
      />
    </div>
  );
}
