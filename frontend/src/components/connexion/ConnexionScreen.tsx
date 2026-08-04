"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff } from "@/components/icons/Icons";
import AuthMapPanel from "@/components/connexion/AuthMapPanel";
import { loginAction, type AuthFormState } from "@/app/actions/auth";

const iconWrapStyle: React.CSSProperties = {
  position: "absolute",
  left: 14,
  display: "flex",
  alignItems: "center",
  color: "#2D6A4F",
  opacity: 0.65,
  pointerEvents: "none",
};

const inputBaseStyle: React.CSSProperties = {
  flex: 1,
  paddingLeft: 42,
};

export default function ConnexionScreen({
  next,
  motDePasseReinitialise = false,
}: {
  next: string;
  motDePasseReinitialise?: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(loginAction, null);

  return (
    <div
      className="connexion-shell"
      style={{ minHeight: "100vh", background: "#F8F5F0", color: "#1B3A2D", boxSizing: "border-box" }}
    >
      <div className="connexion-intro" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/uploads/akal-logo.svg" alt="" className="connexion-intro-mark" style={{ width: 102, height: 102 }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/uploads/akal-wordmark.svg" alt="AKAL" className="connexion-intro-word" style={{ height: 30, width: "auto" }} />
      </div>

      <AuthMapPanel variant="mobile" />

      {/* Colonne formulaire */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", padding: "64px clamp(28px,6vw,96px)", boxSizing: "border-box" }}>
        <div style={{ width: "100%", maxWidth: 440 }}>
          <div className="akal-logo-in" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/uploads/akal-logo.svg" alt="" style={{ width: 54, height: 54, display: "block" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/uploads/akal-wordmark.svg" alt="AKAL" style={{ height: 23, width: "auto", display: "block" }} />
              <span className="tifinagh" style={{ fontSize: 13, letterSpacing: "5px", color: "#8A8378" }}>ⴰⴽⴰⵍ</span>
            </div>
          </div>

          {/* Seul titre de page jusqu'ici — absence de h1 (revue a11y, Phase 3). */}
          <h1
            className="akal-rise"
            style={{ fontSize: 20, lineHeight: 1.5, color: "#1B3A2D", fontWeight: 400, margin: "40px 0 28px", maxWidth: 400, animationDelay: "0.1s" }}
          >
            L&apos;intelligence foncière au service des terres agricoles marocaines.
          </h1>

          <div className="akal-rise" style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 44, animationDelay: "0.18s" }}>
            <span style={{ fontSize: 22, fontWeight: 500, color: "#2D6A4F" }}>Explorez.</span>
            <span style={{ fontSize: 22, fontWeight: 500, color: "#2D6A4F" }}>Comparez.</span>
            <span style={{ fontSize: 22, fontWeight: 500, color: "#2D6A4F" }}>Investissez.</span>
          </div>

          {motDePasseReinitialise && (
            <p
              className="akal-alert-in"
              style={{
                fontSize: 14,
                color: "var(--color-foret)",
                backgroundColor: "var(--color-rosee)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 14px",
                margin: "0 0 20px",
              }}
            >
              Mot de passe réinitialisé. Connectez-vous avec votre nouveau mot de passe.
            </p>
          )}

          <form
            className="akal-rise"
            style={{ display: "flex", flexDirection: "column", gap: 20, animationDelay: "0.26s" }}
            action={formAction}
          >
            <input type="hidden" name="next" value={next} />

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label htmlFor="connexion-email" style={{ fontSize: 12, letterSpacing: "0.5px", color: "#2D6A4F" }}>
                Adresse email
              </label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <span style={iconWrapStyle}>
                  <Mail size={18} strokeWidth={1.8} />
                </span>
                <input
                  id="connexion-email"
                  name="email"
                  type="email"
                  placeholder="vous@exemple.ma"
                  autoComplete="email"
                  required
                  className="connexion-input"
                  style={inputBaseStyle}
                />
              </div>
              {state?.fieldErrors?.email && (
                <p style={{ fontSize: 13, color: "var(--color-erreur)", margin: 0 }}>{state.fieldErrors.email[0]}</p>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <label htmlFor="connexion-password" style={{ fontSize: 12, letterSpacing: "0.5px", color: "#2D6A4F" }}>
                  Mot de passe
                </label>
                <Link
                  href="/mot-de-passe-oublie"
                  style={{ fontSize: 12, color: "#C4622D", borderBottom: "1px solid rgba(196,98,45,0.35)", paddingBottom: 1 }}
                >
                  Mot de passe oublié ?
                </Link>
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <span style={iconWrapStyle}>
                  <Lock size={18} strokeWidth={1.8} />
                </span>
                <input
                  id="connexion-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="connexion-input"
                  style={{ ...inputBaseStyle, paddingRight: 46 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  style={{
                    position: "absolute",
                    right: 12,
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                    color: "#2D6A4F",
                    padding: 4,
                    background: "none",
                    border: "none",
                  }}
                >
                  {showPassword ? <EyeOff size={20} strokeWidth={1.8} /> : <Eye size={20} strokeWidth={1.8} />}
                </button>
              </div>
              {state?.fieldErrors?.password && (
                <p style={{ fontSize: 13, color: "var(--color-erreur)", margin: 0 }}>{state.fieldErrors.password[0]}</p>
              )}
            </div>

            {state?.error && (
              <p className="akal-alert-in" style={{ fontSize: 14, color: "var(--color-erreur)", margin: 0 }}>{state.error}</p>
            )}

            <button type="submit" className="connexion-submit" disabled={pending} style={{ marginTop: 8 }}>
              {pending ? "Connexion…" : "Se connecter"}
            </button>
          </form>

          <div className="akal-rise" style={{ marginTop: 24, fontSize: 14, color: "#2D6A4F", animationDelay: "0.34s" }}>
            Pas encore de compte ?{" "}
            <Link
              href={next !== "/compte" ? `/inscription?next=${encodeURIComponent(next)}` : "/inscription"}
              style={{ color: "#C4622D", textDecoration: "none", borderBottom: "1px solid rgba(196,98,45,0.4)", paddingBottom: 1 }}
            >
              Créer un compte
            </Link>
          </div>
        </div>
      </div>

      <AuthMapPanel variant="desktop" />
    </div>
  );
}
