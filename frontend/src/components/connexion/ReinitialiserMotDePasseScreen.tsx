"use client";

import { useActionState } from "react";
import Link from "next/link";
import { passwordResetConfirmAction } from "@/app/actions/auth";

export default function ReinitialiserMotDePasseScreen({ uid, token }: { uid: string; token: string }) {
  const [state, formAction, pending] = useActionState(passwordResetConfirmAction, null);

  return (
    <div style={{ maxWidth: 440, margin: "96px auto", padding: "0 24px" }}>
      <div className="card akal-fade-in" style={{ padding: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--color-nuit)", margin: "0 0 8px" }}>
          Choisissez un nouveau mot de passe
        </h1>
        <p style={{ color: "var(--color-secondaire)", margin: "0 0 24px", fontSize: 14 }}>
          Ce lien est à usage unique — une fois validé, connectez-vous avec votre nouveau mot de passe.
        </p>

        <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input type="hidden" name="uid" value={uid} />
          <input type="hidden" name="token" value={token} />

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="password" style={{ fontSize: 13, fontWeight: 500, color: "var(--color-texte)" }}>
              Nouveau mot de passe
            </label>
            <input id="password" name="password" type="password" autoComplete="new-password" required className="input" />
            {state?.fieldErrors?.password && (
              <p style={{ fontSize: 13, color: "var(--color-erreur)", margin: 0 }}>{state.fieldErrors.password[0]}</p>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="password_confirmation" style={{ fontSize: 13, fontWeight: 500, color: "var(--color-texte)" }}>
              Confirmer le mot de passe
            </label>
            <input
              id="password_confirmation"
              name="password_confirmation"
              type="password"
              autoComplete="new-password"
              required
              className="input"
            />
            {state?.fieldErrors?.password_confirmation && (
              <p style={{ fontSize: 13, color: "var(--color-erreur)", margin: 0 }}>
                {state.fieldErrors.password_confirmation[0]}
              </p>
            )}
          </div>

          {state?.fieldErrors?.token && (
            <p className="akal-alert-in" style={{ fontSize: 14, color: "var(--color-erreur)", margin: 0 }}>
              {state.fieldErrors.token[0]}{" "}
              <Link href="/mot-de-passe-oublie" style={{ color: "var(--color-erreur)" }}>
                Redemander un lien.
              </Link>
            </p>
          )}
          {state?.error && !state?.fieldErrors && (
            <p className="akal-alert-in" style={{ fontSize: 14, color: "var(--color-erreur)", margin: 0 }}>
              {state.error}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Enregistrement…" : "Réinitialiser le mot de passe"}
          </button>
        </form>
      </div>
    </div>
  );
}
