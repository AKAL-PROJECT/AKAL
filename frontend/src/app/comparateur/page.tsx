import type { Metadata } from "next";
import Link from "next/link";
import { MountainEmpty } from "@/components/icons/Icons";

export const metadata: Metadata = {
  title: "Comparateur • AKAL",
  description: "Le comparateur de parcelles arrive bientôt sur AKAL.",
};

export default async function ComparateurPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const count = ids ? ids.split(",").filter(Boolean).length : 0;

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
      <h1 style={{ fontSize: "24px", fontWeight: 500, margin: 0 }}>Le comparateur arrive bientôt</h1>
      <p style={{ fontSize: "15px", color: "var(--color-secondaire)", maxWidth: "440px", lineHeight: 1.6, margin: 0 }}>
        {count > 0
          ? `Vous aviez sélectionné ${count} parcelle${count > 1 ? "s" : ""} à comparer — cette vue détaillée arrive bientôt.`
          : "La comparaison côte à côte de vos parcelles favorites arrive bientôt."}
      </p>
      <Link href="/parcelles" className="btn-primary" style={{ textDecoration: "none", marginTop: "8px" }}>
        Retour au catalogue
      </Link>
    </div>
  );
}
