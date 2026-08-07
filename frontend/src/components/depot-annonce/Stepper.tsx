import { Check } from "@/components/icons/Icons";

export function Stepper({
  etapes,
  etapeActive,
  onEtapeClick,
}: {
  etapes: readonly string[];
  etapeActive: number;
  // Navigation libre entre étapes (modification d'une annonce déjà déposée,
  // 2026-08-07) — omis en dépôt initial : le contenu de l'étape suivante
  // n'existe pas encore tant que l'étape courante n'a pas été validée, donc
  // rien à rejoindre en avance là-bas. En édition, tout est déjà enregistré
  // (chaque étape sauvegarde immédiatement), donc sauter directement à
  // "Localisation" pour retoucher un polygone est sûr.
  onEtapeClick?: (i: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {etapes.map((label, i) => {
        const cliquable = onEtapeClick !== undefined && i !== etapeActive;
        return (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              flex: i < etapes.length - 1 ? 1 : undefined,
              gap: 8,
            }}
          >
            <button
              type="button"
              disabled={!cliquable}
              onClick={() => onEtapeClick?.(i)}
              aria-label={`Aller à l'étape ${label}`}
              aria-current={i === etapeActive ? "step" : undefined}
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
                border: "none",
                padding: 0,
                backgroundColor: i <= etapeActive ? "var(--color-foret)" : "var(--color-fond-input)",
                color: i <= etapeActive ? "white" : "var(--color-tertiaire)",
                boxShadow: i === etapeActive ? "0 0 0 3px var(--color-menthe)" : "none",
                cursor: cliquable ? "pointer" : "default",
                transition: "background-color 250ms ease, color 250ms ease, box-shadow 250ms ease",
              }}
            >
              {i < etapeActive ? <Check size={16} /> : i + 1}
            </button>
            <span
              style={{
                fontSize: 13,
                fontWeight: i === etapeActive ? 600 : 400,
                color: i <= etapeActive ? "var(--color-texte)" : "var(--color-tertiaire)",
                whiteSpace: "nowrap",
                cursor: cliquable ? "pointer" : "default",
              }}
              onClick={() => cliquable && onEtapeClick?.(i)}
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
        );
      })}
    </div>
  );
}
