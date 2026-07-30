import Link from "next/link";

export default function Footer() {
  return (
    <footer style={{
      backgroundColor: "var(--color-nuit)",
      color: "var(--color-menthe)",
      padding: "56px 40px 40px",
      marginTop: "auto",
    }}>
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "40px",
        }}
      >
        <div>
          <div style={{ fontSize: "20px", fontWeight: 600, color: "white", marginBottom: "6px" }}>AKAL</div>
          <div className="tifinagh" style={{ fontSize: "13px", color: "var(--color-menthe)", marginBottom: "16px" }}>
            ⴰⴽⴰⵍ
          </div>
          <p style={{ fontSize: "14px", color: "var(--color-menthe)", lineHeight: 1.6, maxWidth: "280px", margin: 0 }}>
            La marketplace des terres agricoles du Maroc.
          </p>
        </div>

        <div>
          <div style={{ fontSize: "13px", fontWeight: 500, color: "white", marginBottom: "14px" }}>Explorer</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Link href="/parcelles" style={{ fontSize: "14px", color: "var(--color-menthe)", textDecoration: "none" }}>
              Parcelles
            </Link>
            <Link href="/parcelles" style={{ fontSize: "14px", color: "var(--color-menthe)", textDecoration: "none" }}>
              Carte
            </Link>
          </div>
        </div>

        <div>
          <div style={{ fontSize: "13px", fontWeight: 500, color: "white", marginBottom: "14px" }}>Vendre</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Link href="/publier" style={{ fontSize: "14px", color: "var(--color-menthe)", textDecoration: "none" }}>
              Déposer une annonce
            </Link>
            <Link href="/#comment-ca-marche" style={{ fontSize: "14px", color: "var(--color-menthe)", textDecoration: "none" }}>
              Comment ça marche
            </Link>
          </div>
        </div>

        <div>
          <div style={{ fontSize: "13px", fontWeight: 500, color: "white", marginBottom: "14px" }}>À propos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <span style={{ fontSize: "14px", color: "var(--color-menthe)", opacity: 0.7 }}>Notre mission</span>
            <span style={{ fontSize: "14px", color: "var(--color-menthe)", opacity: 0.7 }}>Contact</span>
          </div>
        </div>
      </div>

      <div
        style={{
          maxWidth: "1100px",
          margin: "40px auto 0",
          paddingTop: "24px",
          borderTop: "1px solid rgba(183,215,201,0.2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <span style={{ fontSize: "13px", color: "var(--color-tertiaire)" }}>
          © 2026 AKAL — Société Marocaine d&apos;Ingénierie Immobilière
        </span>
        <span style={{ fontSize: "13px", color: "var(--color-tertiaire)" }}>EIGSI Casablanca</span>
      </div>
    </footer>
  );
}
