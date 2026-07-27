import type { Metadata } from "next";
import Link from "next/link";
import { MountainEmpty } from "@/components/icons/Icons";

export const metadata: Metadata = {
  title: "Déposer une annonce • AKAL",
  description: "Le dépôt d'annonce arrive bientôt sur AKAL.",
};

export default function PublierPage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "120px 20px",
        gap: "20px",
        textAlign: "center",
      }}
    >
      <span style={{ color: "var(--color-foret)" }}>
        <MountainEmpty size={64} />
      </span>
      <h1 style={{ fontSize: "24px", fontWeight: 500, margin: 0 }}>Le dépôt d&apos;annonce arrive bientôt</h1>
      <p style={{ fontSize: "15px", color: "var(--color-secondaire)", maxWidth: "440px", lineHeight: 1.6, margin: 0 }}>
        Nous finalisons l&apos;expérience de dépôt de parcelle — statut foncier, photos, localisation.
        Revenez bientôt, ou explorez déjà les parcelles disponibles.
      </p>
      <Link href="/parcelles" className="btn-primary" style={{ textDecoration: "none", marginTop: "8px" }}>
        Explorer les parcelles
      </Link>
    </div>
  );
}
