// Barre de visualisation de l'AgriScore (/100).
// Couleur selon seuil : vert ≥ 75, blé 50-74, terre < 50.
// `score` est nullable : l'AgriScore peut ne pas encore être calculé côté back
// (contrat §3.5 — texte "Score en cours de calcul" imposé, jamais d'erreur ni de 0).

export default function ScoreBar({ score }: { score: number | null }) {
  if (score == null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div
          style={{
            flex: 1,
            height: "6px",
            borderRadius: "var(--radius-full)",
            backgroundColor: "var(--color-menthe)",
          }}
        />
        <span style={{ fontSize: "12px", color: "var(--color-tertiaire)", whiteSpace: "nowrap" }}>
          Score en cours de calcul
        </span>
      </div>
    );
  }

  const couleur =
    score >= 75
      ? "var(--color-foret)"
      : score >= 50
        ? "var(--color-ble)"
        : "var(--color-terre)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div
        style={{
          flex: 1,
          height: "6px",
          borderRadius: "var(--radius-full)",
          backgroundColor: "var(--color-menthe)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${score}%`,
            borderRadius: "var(--radius-full)",
            backgroundColor: couleur,
            transition: "width 200ms ease",
          }}
        />
      </div>
      <span style={{ fontSize: "12px", fontWeight: 500, color: couleur, whiteSpace: "nowrap" }}>
        {score}/100
      </span>
    </div>
  );
}
