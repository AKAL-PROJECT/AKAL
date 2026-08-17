"use client";

import { useActionState, useState, useTransition, useRef } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { ChevronDown, ChevronLeft } from "@/components/icons/Icons";
import {
  googleLoginAction,
  phoneLoginAction,
  type AuthFormState,
} from "@/app/actions/auth";
import {
  sendPhoneSms,
  verifyPhoneOtp,
  type ConfirmationResult,
} from "@/lib/firebase-client";
import { COUNTRY_CODES } from "@/lib/country-codes";
import AuthMapPanel from "@/components/connexion/AuthMapPanel";

// ─── Types de vue ─────────────────────────────────────────────────────────────
type Vue = "accueil" | "otp" | "identite";

// ─── Composant principal ──────────────────────────────────────────────────────
export default function ConnexionScreen({
  next,
}: {
  next: string;
}) {
  const [vue, setVue] = useState<Vue>("accueil");
  const [googlePending, startGoogleTransition] = useTransition();
  const [googleError, setGoogleError] = useState<string | null>(null);
  const googleFormRef = useRef<HTMLFormElement>(null);
  const googleTokenRef = useRef<HTMLInputElement>(null);

  // Flux téléphone
  const [countryCode, setCountryCode] = useState("+212");
  const [localNumber, setLocalNumber] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [firebaseIdToken, setFirebaseIdToken] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [smsPending, setSmsPending] = useState(false);
  const [otpPending, setOtpPending] = useState(false);

  // Server Actions
  const [googleState, googleFormAction, googleActionPending] = useActionState<AuthFormState, FormData>(googleLoginAction, null);
  const [phoneState, phoneAction, phoneActionPending] = useActionState<AuthFormState, FormData>(phoneLoginAction, null);

  // Numéro complet en format E.164
  const fullPhone = `${countryCode}${localNumber.replace(/^0/, "").replace(/\s/g, "")}`;

  // ─── Connexion Google ───────────────────────────────────────────────────────
  const handleGoogleSuccess = (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      setGoogleError("Connexion Google échouée. Réessayez.");
      return;
    }
    setGoogleError(null);
    startGoogleTransition(() => {
      if (googleTokenRef.current) googleTokenRef.current.value = credentialResponse.credential!;
      googleFormRef.current?.requestSubmit();
    });
  };

  const handleGoogleError = () => {
    setGoogleError("Connexion Google échouée. Réessayez.");
  };

  // ─── Envoi SMS ─────────────────────────────────────────────────────────────
  async function handleEnvoiSms() {
    setPhoneError(null);
    const digits = localNumber.replace(/\s/g, "").replace(/^0/, "");
    if (!digits || digits.length < 6) {
      setPhoneError("Numéro incomplet.");
      return;
    }
    setSmsPending(true);
    try {
      const result = await sendPhoneSms(fullPhone, "recaptcha-container");
      setConfirmationResult(result);
      setVue("otp");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Phone SMS error:", msg);
      if (msg.includes("invalid-phone-number")) {
        setPhoneError("Numéro invalide. Vérifiez le format.");
      } else if (msg.includes("too-many-requests")) {
        setPhoneError("Trop de tentatives. Réessayez dans quelques minutes.");
      } else if (msg.includes("billing-not-enabled")) {
        setPhoneError("Service SMS non activé. Contactez l'administrateur.");
      } else if (msg.includes("operation-not-allowed") || msg.includes("region enabled")) {
        setPhoneError("Firebase: SMS désactivé pour cette région. (À activer dans Firebase Console > Auth > Settings > SMS region policy).");
      } else {
        setPhoneError("Envoi du SMS échoué. Vérifiez votre numéro.");
      }
    } finally {
      setSmsPending(false);
    }
  }

  // ─── Vérification OTP ──────────────────────────────────────────────────────
  async function handleVerifyOtp() {
    if (!confirmationResult) return;
    setPhoneError(null);
    if (otpCode.length !== 6) {
      setPhoneError("Le code doit contenir 6 chiffres.");
      return;
    }
    setOtpPending(true);
    try {
      const idToken = await verifyPhoneOtp(confirmationResult, otpCode);
      setFirebaseIdToken(idToken);
      setVue("identite");
    } catch {
      setPhoneError("Code incorrect ou expiré. Réessayez.");
    } finally {
      setOtpPending(false);
    }
  }

  const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];

  // ─── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="connexion-shell"
      style={{ minHeight: "100vh", background: "#F8F5F0", color: "#1B3A2D", boxSizing: "border-box" }}
    >
      {/* Container reCAPTCHA invisible */}
      <div id="recaptcha-container" />

      {/* Formulaire caché pour Google */}
      <form ref={googleFormRef} action={googleFormAction} style={{ display: "none" }}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="token" ref={googleTokenRef} />
      </form>

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

          {/* Logo pour desktop */}
          <div className="akal-logo-in" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 40 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/uploads/akal-logo.svg" alt="" style={{ width: 54, height: 54, display: "block" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/uploads/akal-wordmark.svg" alt="AKAL" style={{ height: 23, width: "auto", display: "block" }} />
              <span className="tifinagh" style={{ fontSize: 13, letterSpacing: "5px", color: "#8A8378" }}>ⴰⴽⴰⵍ</span>
            </div>
          </div>

        {/* ═══ VUE ACCUEIL (Téléphone & Google) ═══════════════════════════ */}
        {vue === "accueil" && (
          <div className="akal-rise">
            <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1B3A2D", margin: "0 0 8px" }}>
              Connexion ou inscription
            </h1>
            <p style={{ fontSize: 15, color: "#8A8378", margin: "0 0 32px", lineHeight: 1.4 }}>
              Utilisez votre numéro de téléphone pour vous connecter rapidement
            </p>

            <label style={{ fontSize: 14, color: "#333", display: "block", marginBottom: 8 }}>
              Numéro de téléphone
            </label>
            
            <div
              style={{
                display: "flex",
                alignItems: "center",
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "4px",
                marginBottom: "24px",
                background: "#fff",
                transition: "border-color 0.2s",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "#98b9f2")}
              onBlur={e => (e.currentTarget.style.borderColor = "#ddd")}
            >
              {/* Sélecteur de pays avec drapeau */}
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <select
                  value={countryCode}
                  onChange={e => setCountryCode(e.target.value)}
                  style={{
                    position: "absolute",
                    top: 0, left: 0, width: "100%", height: "100%",
                    opacity: 0, cursor: "pointer",
                  }}
                >
                  {COUNTRY_CODES.map(c => (
                    <option key={c.code + c.name} value={c.code}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
                <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", gap: 6 }}>
                  {/* Utilise flagcdn pour un support garanti sur Windows */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://flagcdn.com/w20/${selectedCountry?.cca2 || "ma"}.png`}
                    alt={selectedCountry?.name}
                    style={{ width: 20, height: 15, objectFit: "cover", borderRadius: 2 }}
                  />
                  <ChevronDown size={14} style={{ color: "#666" }} />
                </div>
              </div>
              
              <div style={{ width: 1, height: 24, background: "#eee", margin: "0 4px" }} />

              <input
                type="tel"
                placeholder="6 XX XX XX XX"
                value={localNumber}
                onChange={e => setLocalNumber(e.target.value)}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  padding: "12px",
                  fontSize: 16,
                  background: "transparent",
                }}
                autoComplete="tel-national"
              />
            </div>

            {phoneError && <p style={{ fontSize: 13, color: "var(--color-erreur)", margin: "-16px 0 16px" }}>{phoneError}</p>}

            <button
              onClick={handleEnvoiSms}
              disabled={smsPending || !localNumber}
              className="connexion-submit"
              style={{
                width: "100%",
                padding: "14px",
                background: "var(--color-primary, #2D6A4F)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-md)",
                fontSize: 16,
                fontWeight: 500,
                cursor: (smsPending || !localNumber) ? "not-allowed" : "pointer",
                transition: "opacity 0.2s",
                opacity: (smsPending || !localNumber) ? 0.7 : 1,
              }}
            >
              {smsPending ? "Envoi du SMS…" : "Continuer"}
            </button>

            {/* AUDIT — <GoogleLogin> exige d'être monté sous <GoogleOAuthProvider>,
                or GoogleAuthProviderWrapper (layout racine) omet ce provider en
                silence quand NEXT_PUBLIC_GOOGLE_CLIENT_ID est absent (repli
                volontaire, cf. src/components/GoogleAuthProvider.tsx). Rendre
                <GoogleLogin> quand même levait "Google OAuth components must
                be used within GoogleOAuthProvider", plantant toute la page
                /connexion — même symptôme (500), cause distincte du bloqueur
                Firebase. Même repli ici : pas de client ID, pas de bouton. */}
            {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
              <>
                <div style={{ display: "flex", alignItems: "center", margin: "32px 0" }}>
                  <div style={{ flex: 1, height: 1, background: "#eee" }} />
                  <span style={{ margin: "0 16px", color: "#888", fontSize: 14 }}>Ou avec</span>
                  <div style={{ flex: 1, height: 1, background: "#eee" }} />
                </div>

                {/* Google Login via @react-oauth/google */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    shape="rectangular"
                    theme="outline"
                    text="signin_with"
                  />
                </div>
              </>
            )}
            {(googleError || googleState?.error) && (
              <p style={{ fontSize: 13, color: "var(--color-erreur)", textAlign: "center", marginTop: "12px" }}>
                {googleError ?? googleState?.error}
              </p>
            )}
          </div>
        )}

        {/* ═══ VUE OTP ══════════════════════════════════════════════════ */}
        {vue === "otp" && (
          <div className="akal-rise" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <button type="button" onClick={() => { setVue("accueil"); setPhoneError(null); setOtpCode(""); }}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#666", padding: 0, marginBottom: 8 }}>
              <ChevronLeft size={16} /> Retour
            </button>

            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#000", margin: 0 }}>
              Vérifiez votre numéro
            </h1>
            <p style={{ fontSize: 15, color: "#666", margin: "0 0 16px" }}>
              Code envoyé au <strong>{fullPhone}</strong>
            </p>

            <div>
              <label style={{ fontSize: 13, color: "#333", display: "block", marginBottom: 8 }}>
                Code de vérification
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                style={{
                  width: "100%",
                  textAlign: "center",
                  letterSpacing: "12px",
                  fontSize: 24,
                  fontWeight: 600,
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  padding: "16px",
                  boxSizing: "border-box",
                }}
                autoFocus
              />
            </div>

            {phoneError && <p style={{ fontSize: 13, color: "var(--color-erreur)", margin: 0 }}>{phoneError}</p>}

            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={otpPending || otpCode.length !== 6}
              style={{
                width: "100%",
                padding: "14px",
                background: "#98b9f2",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: 16,
                fontWeight: 500,
                cursor: (otpPending || otpCode.length !== 6) ? "not-allowed" : "pointer",
                marginTop: "8px",
              }}
            >
              {otpPending ? "Vérification…" : "Vérifier le code"}
            </button>

            <button type="button"
              onClick={() => { setVue("accueil"); setOtpCode(""); setPhoneError(null); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#666", textDecoration: "underline", textUnderlineOffset: 3, padding: 0, alignSelf: "center", marginTop: 8 }}>
              Renvoyer le code
            </button>
          </div>
        )}

        {/* ═══ VUE IDENTITÉ (nouveau utilisateur téléphone) ════════════ */}
        {vue === "identite" && (
          <form
            className="akal-rise"
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
            action={phoneAction}
          >
            <input type="hidden" name="token" value={firebaseIdToken} />
            <input type="hidden" name="next" value={next} />

            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#000", margin: 0 }}>
              Bienvenue sur AKAL 👋
            </h1>
            <p style={{ fontSize: 15, color: "#666", margin: "0 0 16px" }}>
              Pour finaliser votre compte, indiquez votre prénom et nom.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13, color: "#333" }}>Prénom</label>
              <input
                name="prenom"
                type="text"
                placeholder="Ex: Youssef"
                required
                value={prenom}
                onChange={e => setPrenom(e.target.value)}
                style={{
                  width: "100%",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  padding: "14px",
                  fontSize: 15,
                  boxSizing: "border-box",
                }}
                autoFocus
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13, color: "#333" }}>Nom</label>
              <input
                name="nom"
                type="text"
                placeholder="Ex: Alaoui"
                required
                value={nom}
                onChange={e => setNom(e.target.value)}
                style={{
                  width: "100%",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  padding: "14px",
                  fontSize: 15,
                  boxSizing: "border-box",
                }}
              />
            </div>

            {(phoneState?.error || phoneError) && (
              <p style={{ fontSize: 13, color: "var(--color-erreur)", margin: 0 }}>
                {phoneState?.error ?? phoneError}
              </p>
            )}

            <button type="submit" disabled={phoneActionPending}
              className="connexion-submit"
              style={{
                width: "100%",
                padding: "14px",
                background: "var(--color-primary, #2D6A4F)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-md)",
                fontSize: 16,
                fontWeight: 500,
                cursor: phoneActionPending ? "not-allowed" : "pointer",
                marginTop: "8px",
              }}
            >
              {phoneActionPending ? "Enregistrement…" : "Enregistrer et continuer"}
            </button>
          </form>
        )}

        </div>
      </div>

      <AuthMapPanel variant="desktop" />
    </div>
  );
}
