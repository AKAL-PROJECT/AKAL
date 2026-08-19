"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Mail, Lock, Phone, User, Eye, EyeOff } from "@/components/icons/Icons";
import AuthMapPanel from "@/components/connexion/AuthMapPanel";
import { signupAction, type AuthFormState } from "@/app/actions/auth";

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

const labelStyle: React.CSSProperties = { fontSize: 12, letterSpacing: "0.5px", color: "#2D6A4F" };
const champErreurStyle: React.CSSProperties = { fontSize: 13, color: "var(--color-erreur)", margin: 0 };

export default function InscriptionScreen({ next }: { next: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signupAction, null);

  return (
    <div
      className="connexion-shell"
      style={{ minHeight: "100vh", background: "#F8F5F0", color: "#1B3A2D", boxSizing: "border-box" }}
    >
      {/* Colonne formulaire — padding vertical resserré sous 480px (audit
          mobile du 19/08, cf. .connexion-form-col dans globals.css). */}
      <div className="connexion-form-col" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", padding: "64px clamp(28px,6vw,96px)", boxSizing: "border-box" }}>
        <div style={{ width: "100%", maxWidth: 440 }}>
          <div className="akal-rise" style={{ display: "flex", alignItems: "center", gap: 14 }}>
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
            Rejoignez AKAL et accédez au foncier agricole marocain en toute confiance.
          </h1>

          <div className="akal-rise" style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 44, animationDelay: "0.18s" }}>
            <span style={{ fontSize: 22, fontWeight: 500, color: "#2D6A4F" }}>Créez votre compte.</span>
            <span style={{ fontSize: 22, fontWeight: 500, color: "#2D6A4F" }}>Explorez les parcelles.</span>
          </div>

          <form
            className="akal-rise"
            style={{ display: "flex", flexDirection: "column", gap: 20, animationDelay: "0.26s" }}
            action={formAction}
          >
            <input type="hidden" name="next" value={next} />

            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <label htmlFor="prenom" style={labelStyle}>Prénom</label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <span style={iconWrapStyle}>
                    <User size={18} strokeWidth={1.8} />
                  </span>
                  <input id="prenom" name="prenom" type="text" required autoComplete="given-name" className="connexion-input" style={inputBaseStyle} />
                </div>
                {state?.fieldErrors?.prenom && <p style={champErreurStyle}>{state.fieldErrors.prenom[0]}</p>}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <label htmlFor="nom" style={labelStyle}>Nom</label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <span style={iconWrapStyle}>
                    <User size={18} strokeWidth={1.8} />
                  </span>
                  <input id="nom" name="nom" type="text" required autoComplete="family-name" className="connexion-input" style={inputBaseStyle} />
                </div>
                {state?.fieldErrors?.nom && <p style={champErreurStyle}>{state.fieldErrors.nom[0]}</p>}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label htmlFor="email" style={labelStyle}>Adresse email</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <span style={iconWrapStyle}>
                  <Mail size={18} strokeWidth={1.8} />
                </span>
                <input id="email" name="email" type="email" placeholder="vous@exemple.ma" required autoComplete="email" className="connexion-input" style={inputBaseStyle} />
              </div>
              {state?.fieldErrors?.email && <p style={champErreurStyle}>{state.fieldErrors.email[0]}</p>}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label htmlFor="telephone" style={labelStyle}>Téléphone (optionnel)</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <span style={iconWrapStyle}>
                  <Phone size={18} strokeWidth={1.8} />
                </span>
                <input id="telephone" name="telephone" type="tel" autoComplete="tel" className="connexion-input" style={inputBaseStyle} />
              </div>
              {state?.fieldErrors?.telephone && <p style={champErreurStyle}>{state.fieldErrors.telephone[0]}</p>}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label htmlFor="password" style={labelStyle}>Mot de passe</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <span style={iconWrapStyle}>
                  <Lock size={18} strokeWidth={1.8} />
                </span>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
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
              {state?.fieldErrors?.password && <p style={champErreurStyle}>{state.fieldErrors.password[0]}</p>}
            </div>

            {state?.error && <p className="akal-alert-in" style={{ fontSize: 14, color: "var(--color-erreur)", margin: 0 }}>{state.error}</p>}

            <button type="submit" className="connexion-submit" disabled={pending} style={{ marginTop: 8 }}>
              {pending ? "Création du compte…" : "Créer mon compte"}
            </button>
          </form>

          <div className="akal-rise" style={{ marginTop: 24, fontSize: 14, color: "#2D6A4F", animationDelay: "0.34s" }}>
            Déjà un compte ?{" "}
            <Link
              href={next !== "/compte" ? `/connexion?next=${encodeURIComponent(next)}` : "/connexion"}
              style={{ color: "#C4622D", textDecoration: "none", borderBottom: "1px solid rgba(196,98,45,0.4)", paddingBottom: 1 }}
            >
              Se connecter
            </Link>
          </div>
        </div>
      </div>

      <AuthMapPanel />
    </div>
  );
}
