import { BANNIERE_DEMO } from "@/config/features";

// Bandeau « données de démonstration » — cf. config/features.ts::BANNIERE_DEMO.
// Rendu inline (pas de position: fixed) : il informe sans gêner la lecture,
// et disparaît d'un seul booléen quand le catalogue contiendra de vraies
// annonces. `compact` : variante fine pour la fiche (sous le titre).
export function BanniereDemo({ compact = false }: { compact?: boolean }) {
  if (!BANNIERE_DEMO) return null;

  return (
    <div
      role="note"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: compact ? "8px 12px" : "10px 14px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-ble, #E0C068)",
        backgroundColor: "var(--color-ble-fond, #FBF3DE)",
        color: "var(--color-texte)",
        fontSize: compact ? "12px" : "13px",
        lineHeight: 1.5,
      }}
    >
      <span aria-hidden style={{ fontSize: "14px", flexShrink: 0 }}>&#9888;&#65039;</span>
      <span>
        <strong>Exemple illustratif — données de démonstration.</strong>{" "}
        Les annonces présentées ici sont des exemples créés pour la démonstration, pas de vraies offres de vendeurs.
      </span>
    </div>
  );
}
