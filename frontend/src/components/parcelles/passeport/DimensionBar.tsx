// Ligne « dimension » de l'onglet Aperçu du passeport : libellé + barre
// (sous-score /100) + valeur courte. Dimension indisponible → barre vide +
// « indisponible » à la place de la valeur.

function couleurSousScore(sousScore: number): string {
  if (sousScore >= 70) return "var(--color-foret)";
  if (sousScore >= 45) return "var(--color-ble)";
  return "var(--color-terre)";
}

export default function DimensionBar({
  label,
  sousScore,
  valeur,
  indisponible = false,
}: {
  label: string;
  sousScore: number | null;
  valeur: string;
  indisponible?: boolean;
}) {
  const largeur = sousScore === null ? 0 : Math.max(0, Math.min(100, sousScore));

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "104px 1fr auto",
        alignItems: "center",
        gap: "12px",
      }}
    >
      <span style={{ fontSize: "13px", color: "var(--color-secondaire)" }}>{label}</span>
      <div
        style={{
          height: "8px",
          borderRadius: "var(--radius-full)",
          backgroundColor: "var(--color-menthe)",
          overflow: "hidden",
        }}
      >
        {!indisponible && sousScore !== null && (
          <div
            style={{
              height: "100%",
              width: `${largeur}%`,
              borderRadius: "var(--radius-full)",
              backgroundColor: couleurSousScore(sousScore),
              transition: "width 300ms ease",
            }}
          />
        )}
      </div>
      <span
        style={{
          fontSize: "12px",
          fontWeight: 500,
          color: indisponible ? "var(--color-tertiaire)" : "var(--color-nuit)",
          whiteSpace: "nowrap",
        }}
      >
        {indisponible ? "indisponible" : valeur}
      </span>
    </div>
  );
}
