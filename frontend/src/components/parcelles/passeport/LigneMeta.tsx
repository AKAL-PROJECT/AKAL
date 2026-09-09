// Ligne « label ... valeur » — utilisée par la carte d'identification de la
// parcelle et par le détail d'une dimension (OngletsPasseport).
export default function LigneMeta({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        gap: "4px 12px",
        fontSize: "13px",
      }}
    >
      <span style={{ color: "var(--color-tertiaire)" }}>{label}</span>
      <span style={{ fontWeight: 500, color: "var(--color-nuit)", textAlign: "right" }}>{valeur}</span>
    </div>
  );
}
