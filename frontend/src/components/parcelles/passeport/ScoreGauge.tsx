// Jauge circulaire de l'AgriScore global du passeport (/100).
// `score` nullable : `null` quand aucune dimension n'a été exploitable
// (score_global du back à null) → affiche « — / indisponible ».
// Couleur alignée sur bandeScore() (lib/passeport-presentation.ts) : ≥70 vert,
// ≥45 blé, sinon terre.

const RAYON = 52;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

function couleurScore(score: number | null): string {
  if (score === null) return "var(--color-tertiaire)";
  if (score >= 70) return "var(--color-foret)";
  if (score >= 45) return "var(--color-ble)";
  return "var(--color-terre)";
}

export default function ScoreGauge({ score }: { score: number | null }) {
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));
  const offset = CIRCONFERENCE * (1 - pct / 100);
  const couleur = couleurScore(score);

  return (
    <div style={{ position: "relative", width: 128, height: 128, flexShrink: 0 }}>
      <svg
        width="128"
        height="128"
        viewBox="0 0 128 128"
        role="img"
        aria-label={score === null ? "AgriScore indisponible" : `AgriScore ${Math.round(score)} sur 100`}
      >
        <circle cx="64" cy="64" r={RAYON} fill="none" stroke="var(--color-menthe)" strokeWidth="10" />
        {score !== null && (
          <circle
            cx="64"
            cy="64"
            r={RAYON}
            fill="none"
            stroke={couleur}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCONFERENCE}
            strokeDashoffset={offset}
            transform="rotate(-90 64 64)"
            style={{ transition: "stroke-dashoffset 400ms ease" }}
          />
        )}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 30, fontWeight: 600, color: "var(--color-nuit)", lineHeight: 1 }}>
          {score === null ? "—" : Math.round(score)}
        </span>
        <span style={{ fontSize: 10, color: "var(--color-tertiaire)", marginTop: 3, letterSpacing: "0.02em" }}>
          {score === null ? "indisponible" : "AgriScore / 100"}
        </span>
      </div>
    </div>
  );
}
