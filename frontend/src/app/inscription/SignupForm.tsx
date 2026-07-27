"use client";

import { useActionState } from "react";
import { signupAction, type AuthFormState } from "@/app/actions/auth";

const champLabelStyle: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 };
const champErreurStyle: React.CSSProperties = { color: "#C0392B", fontSize: 13, marginTop: 4 };

export function SignupForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signupAction, null);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

      {state?.error && <p style={{ color: "#C0392B", fontSize: 14 }}>{state.error}</p>}

      <button type="submit" className="btn-primary" disabled={pending} style={{ marginTop: 8 }}>
        {pending ? "Création du compte…" : "Créer mon compte"}
      </button>
    </form>
  );
}
