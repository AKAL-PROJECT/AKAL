"use client";

import { useActionState, useState } from "react";
import { signupAction, type AuthFormState } from "@/app/actions/auth";

const champLabelStyle: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 };
const champErreurStyle: React.CSSProperties = { color: "#C0392B", fontSize: 13, marginTop: 4 };

export function SignupForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signupAction, null);
  const [role, setRole] = useState<"VENDEUR" | "ACHETEUR">("VENDEUR");

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <input type="hidden" name="next" value={next} />

      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="prenom" style={champLabelStyle}>Prénom</label>
          <input id="prenom" name="prenom" type="text" required autoComplete="given-name" className="input" />
          {state?.fieldErrors?.prenom && <p style={champErreurStyle}>{state.fieldErrors.prenom[0]}</p>}
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="nom" style={champLabelStyle}>Nom</label>
          <input id="nom" name="nom" type="text" required autoComplete="family-name" className="input" />
          {state?.fieldErrors?.nom && <p style={champErreurStyle}>{state.fieldErrors.nom[0]}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="email" style={champLabelStyle}>Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        {state?.fieldErrors?.email && <p style={champErreurStyle}>{state.fieldErrors.email[0]}</p>}
      </div>

      <div>
        <label htmlFor="telephone" style={champLabelStyle}>Téléphone (optionnel)</label>
        <input id="telephone" name="telephone" type="tel" autoComplete="tel" className="input" />
        {state?.fieldErrors?.telephone && <p style={champErreurStyle}>{state.fieldErrors.telephone[0]}</p>}
      </div>

      <div>
        <label htmlFor="password" style={champLabelStyle}>Mot de passe</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className="input"
        />
        {state?.fieldErrors?.password && <p style={champErreurStyle}>{state.fieldErrors.password[0]}</p>}
      </div>

      <div>
        <span style={champLabelStyle}>Je suis</span>
        <div style={{ display: "flex", gap: 12 }}>
          {(["VENDEUR", "ACHETEUR"] as const).map((valeur) => (
            <label
              key={valeur}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                height: 48,
                borderRadius: "var(--radius-btn)",
                border: `2px solid ${role === valeur ? "var(--color-foret)" : "var(--color-bordure)"}`,
                backgroundColor: role === valeur ? "var(--color-rosee)" : "white",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              <input
                type="radio"
                name="role"
                value={valeur}
                checked={role === valeur}
                onChange={() => setRole(valeur)}
                style={{ display: "none" }}
              />
              {valeur === "VENDEUR" ? "Vendeur" : "Acheteur"}
            </label>
          ))}
        </div>
        {state?.fieldErrors?.role && <p style={champErreurStyle}>{state.fieldErrors.role[0]}</p>}
      </div>

      {state?.error && <p style={{ color: "#C0392B", fontSize: 14 }}>{state.error}</p>}

      <button type="submit" className="btn-primary" disabled={pending} style={{ marginTop: 8 }}>
        {pending ? "Création du compte…" : "Créer mon compte"}
      </button>
    </form>
  );
}
