"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Mail, Lock, Phone, User, Eye, EyeOff, Check } from "@/components/icons/Icons";
import MoroccoMap from "@/components/connexion/MoroccoMap";
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
const champErreurStyle: React.CSSProperties = { fontSize: 13, color: "#C0392B", margin: 0 };

export default function InscriptionScreen() {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signupAction, null);

  return (
    <div
      className="connexion-shell"
      style={{ minHeight: "100vh", background: "#F8F5F0", color: "#1B3A2D", boxSizing: "border-box" }}
    >
      {/* Colonne formulaire */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", padding: "64px clamp(28px,6vw,96px)", boxSizing: "border-box" }}>
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

          <p
            className="akal-rise"
            style={{ fontSize: 20, lineHeight: 1.5, color: "#1B3A2D", fontWeight: 400, margin: "40px 0 28px", maxWidth: 400, animationDelay: "0.1s" }}
          >
            Rejoignez AKAL et accédez au foncier agricole marocain en toute confiance.
          </p>

          <div className="akal-rise" style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 44, animationDelay: "0.18s" }}>
            <span style={{ fontSize: 22, fontWeight: 500, color: "#2D6A4F" }}>Créez votre compte.</span>
            <span style={{ fontSize: 22, fontWeight: 500, color: "#2D6A4F" }}>Explorez les parcelles.</span>
          </div>

          <form
            className="akal-rise"
            style={{ display: "flex", flexDirection: "column", gap: 20, animationDelay: "0.26s" }}
            action={formAction}
          >
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

            {state?.error && <p className="akal-alert-in" style={{ fontSize: 14, color: "#C0392B", margin: 0 }}>{state.error}</p>}

            <button type="submit" className="connexion-submit" disabled={pending} style={{ marginTop: 8 }}>
              {pending ? "Création du compte…" : "Créer mon compte"}
            </button>
          </form>

          <div className="akal-rise" style={{ marginTop: 24, fontSize: 14, color: "#2D6A4F", animationDelay: "0.34s" }}>
            Déjà un compte ?{" "}
            <Link
              href="/connexion"
              style={{ color: "#C4622D", textDecoration: "none", borderBottom: "1px solid rgba(196,98,45,0.4)", paddingBottom: 1 }}
            >
              Se connecter
            </Link>
          </div>
        </div>
      </div>

      {/* Colonne carte vivante */}
      <div
        className="connexion-map-col"
        style={{
          flex: 1,
          minWidth: 0,
          position: "relative",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          padding: "44px 48px",
          boxSizing: "border-box",
          overflow: "hidden",
          borderLeft: "1px solid rgba(45,106,79,0.12)",
          background: "radial-gradient(115% 85% at 68% 32%, #EDF4EC 0%, #F6F2EB 52%, #F2ECE3 100%)",
        }}
      >
        <svg
          viewBox="0 0 600 760"
          preserveAspectRatio="xMidYMid slice"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.45, pointerEvents: "none" }}
          fill="none"
          stroke="#2D6A4F"
          strokeOpacity={0.14}
          strokeWidth={1.2}
        >
          <path d="M-40 210 C120 160 240 250 360 200 S560 130 660 190" />
          <path d="M-40 250 C120 200 240 290 360 240 S560 170 660 230" />
          <path d="M-40 300 C130 250 250 340 370 290 S570 220 660 285" />
          <path d="M-40 360 C140 315 260 400 380 350 S580 285 660 350" />
          <path d="M-40 430 C150 385 270 470 390 420 S590 355 660 420" />
          <path d="M-40 510 C160 465 280 550 400 500 S600 435 660 500" />
          <path d="M-40 590 C170 545 290 630 410 580 S610 515 660 580" />
          <ellipse cx="410" cy="300" rx="150" ry="110" />
          <ellipse cx="410" cy="300" rx="105" ry="76" />
          <ellipse cx="410" cy="300" rx="62" ry="44" />
        </svg>

        <MoroccoMap />

        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "repeat(2,minmax(0,1fr))",
            gap: 12,
            width: "100%",
            maxWidth: 420,
          }}
          className="akal-stat-in"
        >
          {["Statut foncier vérifié", "Sans intermédiaire", "Couverture nationale"].map((texte) => (
            <div
              key={texte}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                background: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(45,106,79,0.16)",
                borderRadius: 12,
                padding: "12px 16px",
                boxShadow: "0 2px 10px rgba(27,58,45,0.05)",
              }}
            >
              <span style={{ display: "flex", flexShrink: 0, color: "#2D6A4F" }}>
                <Check size={18} strokeWidth={2} />
              </span>
              <span style={{ fontSize: 13, color: "#1B3A2D", fontWeight: 500 }}>{texte}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
