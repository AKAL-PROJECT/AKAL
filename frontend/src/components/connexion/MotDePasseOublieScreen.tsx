"use client";

import { useActionState } from "react";
import Link from "next/link";
import { passwordResetRequestAction } from "@/app/actions/auth";

export default function MotDePasseOublieScreen() {
  const [state, formAction, pending] = useActionState(passwordResetRequestAction, null);

  return (
    <div style={{ maxWidth: 440, margin: "96px auto", padding: "0 24px" }}>
      <div className="card akal-fade-in" style={{ padding: 32 }}>
        {state?.envoye ? (
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--color-nuit)", margin: "0 0 12px" }}>
              Vérifiez votre boîte mail
            </h1>
            <p style={{ color: "var(--color-secondaire)", margin: 0, lineHeight: 1.6 }}>
              Si un compte existe avec cette adresse, un lien de réinitialisation vient de lui être envoyé.
            </p>
            <Link
              href="/connexion"
              className="btn-secondary"
              style={{ display: "inline-block", marginTop: 24, textDecoration: "none" }}
            >
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--color-nuit)", margin: "0 0 8px" }}>
              Mot de passe oublié ?
            </h1>
            <p style={{ color: "var(--color-secondaire)", margin: "0 0 24px", fontSize: 14 }}>
              Indiquez votre adresse email : nous vous enverrons un lien pour en choisir un nouveau.
            </p>

            <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label htmlFor="email" style={{ fontSize: 13, fontWeight: 500, color: "var(--color-texte)" }}>
                  Adresse email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="vous@exemple.ma"
                  autoComplete="email"
                  required
                  className="input"
                />
                {state?.fieldErrors?.email && (
                  <p style={{ fontSize: 13, color: "var(--color-erreur)", margin: 0 }}>{state.fieldErrors.email[0]}</p>
                )}
              </div>

              {state?.error && !state?.fieldErrors && (
                <p className="akal-alert-in" style={{ fontSize: 14, color: "var(--color-erreur)", margin: 0 }}>
                  {state.error}
                </p>
              )}

              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? "Envoi…" : "Envoyer le lien"}
              </button>
            </form>

            <div style={{ marginTop: 20, fontSize: 14, textAlign: "center" }}>
              <Link href="/connexion" style={{ color: "var(--color-terre)" }}>
                Retour à la connexion
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
