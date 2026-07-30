import { Check } from "@/components/icons/Icons";

export function Stepper({ etapes, etapeActive }: { etapes: readonly string[]; etapeActive: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {etapes.map((label, i) => (
        <div
          key={label}
          style={{
            display: "flex",
            alignItems: "center",
            flex: i < etapes.length - 1 ? 1 : undefined,
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: "50%",
              flexShrink: 0,
              fontSize: 13,
              fontWeight: 600,
              backgroundColor: i <= etapeActive ? "var(--color-foret)" : "var(--color-fond-input)",
              color: i <= etapeActive ? "white" : "var(--color-tertiaire)",
              boxShadow: i === etapeActive ? "0 0 0 3px var(--color-menthe)" : "none",
              transition: "background-color 250ms ease, color 250ms ease, box-shadow 250ms ease",
            }}
          >
            {i < etapeActive ? <Check size={16} /> : i + 1}
          </div>
          <span
            style={{
              fontSize: 13,
              fontWeight: i === etapeActive ? 600 : 400,
              color: i <= etapeActive ? "var(--color-texte)" : "var(--color-tertiaire)",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
          {i < etapes.length - 1 && (
            <div
              style={{
                flex: 1,
                height: 2,
                backgroundColor: i < etapeActive ? "var(--color-foret)" : "var(--color-bordure)",
                margin: "0 4px",
                transition: "background-color 250ms ease",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
