"use client";

import { useActionState } from "react";
import { loginAction, type AuthFormState } from "@/app/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(loginAction, null);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <input type="hidden" name="next" value={next} />

      <div>
        <label htmlFor="email" style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        {state?.fieldErrors?.email && (
          <p style={{ color: "#C0392B", fontSize: 13, marginTop: 4 }}>{state.fieldErrors.email[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
        {state?.fieldErrors?.password && (
          <p style={{ color: "#C0392B", fontSize: 13, marginTop: 4 }}>{state.fieldErrors.password[0]}</p>
        )}
      </div>

      {state?.error && <p style={{ color: "#C0392B", fontSize: 14 }}>{state.error}</p>}

      <button type="submit" className="btn-primary" disabled={pending} style={{ marginTop: 8 }}>
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
