"use client";

import { useActionState, useState, useTransition, useRef } from "react";
import Link from "next/link";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { ChevronDown, ChevronLeft, Mail, Phone } from "@/components/icons/Icons";
import {
  googleLoginAction,
  loginAction,
  phoneLoginAction,
  signupAction,
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
// Méthode choisie sur la vue accueil — Google reste toujours disponible en
// plus (bouton séparé, pas un 3e onglet, cf. rendu plus bas).
type Methode = "telephone" | "email";
// Sous-mode de l'onglet Email : le backend a deux endpoints distincts
// (login échoue si le compte n'existe pas, signup échoue si l'email est
// déjà pris — cf. LoginSerializer/SignupSerializer) contrairement au
// téléphone qui unifie connexion/création via un seul flux OTP. Pas de
// détection automatique possible ici : LoginSerializer renvoie
// volontairement "Email ou mot de passe incorrect." sans distinguer
// "compte introuvable" de "mauvais mot de passe" (anti-énumération), donc
// bascule manuelle plutôt qu'une redirection automatique fragile.
type ModeEmail = "connexion" | "creation";

// Erreur de champ individuelle sous l'input concerné, distincte du message
// générique `state.error` affiché en bas de formulaire (les deux coexistent :
// voir commentaire au-dessus des <input name="email"/"password"> ci-dessous).
const champErreurStyle: React.CSSProperties = { fontSize: 13, color: "var(--color-erreur)", margin: "6px 0 0" };

// ─── Composant principal ──────────────────────────────────────────────────────
export default function ConnexionScreen({
  next,
}: {
  next: string;
}) {
  const [vue, setVue] = useState<Vue>("accueil");
  const [methode, setMethode] = useState<Methode>("telephone");
  const [modeEmail, setModeEmail] = useState<ModeEmail>("connexion");
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
  const [loginState, loginFormAction, loginActionPending] = useActionState<AuthFormState, FormData>(loginAction, null);
  const [signupState, signupFormAction, signupActionPending] = useActionState<AuthFormState, FormData>(signupAction, null);

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
      } else if (msg.includes("invalid-api-key") || msg.includes("api-key-not-valid") || msg.includes("configuration-not-found")) {
        // NEXT_PUBLIC_FIREBASE_* absentes/invalides (cf. lib/firebase.ts) —
        // rien à voir avec le numéro saisi, donc pas le même message que le
        // cas générique ci-dessous : accuser le numéro serait trompeur.
        setPhoneError("Connexion au service d'envoi de SMS impossible pour le moment. Contactez l'administrateur.");
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

      {/* Filigrane carte — mobile (<820px) uniquement, cf. .connexion-watermark
          (globals.css). Option retenue lors de l'audit du 19/08 pour garder
          un rappel de marque sur mobile sans reproduire le problème du
          bandeau .connexion-map-mobile retiré au même audit : `position:
          fixed` + opacité quasi nulle + pointer-events:none, donc 0px de
          hauteur consommée et aucun risque de repousser le formulaire sous
          la ligne de flottaison. Masqué ≥820px par la classe elle-même : le
          panneau desktop (AuthMapPanel) porte déjà la vraie carte
          interactive juste à côté. */}
      <div className="connexion-watermark" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/uploads/akal-maroc-regions.svg"
          alt=""
          style={{ position: "absolute", top: "50%", right: "-18%", transform: "translateY(-50%)", width: "85vw", maxWidth: "560px", height: "auto" }}
        />
      </div>

      {/* Colonne formulaire — padding vertical resserré sous 480px (audit
          mobile du 19/08, cf. .connexion-form-col dans globals.css) :
          64px de padding fixe haut+bas avait du sens quand le bandeau
          carte (retiré, cf. AuthMapPanel.tsx) précédait déjà ce bloc sur
          mobile, plus maintenant que ce bloc démarre en tout premier.
          position/zIndex : passe au-dessus du filigrane ci-dessus (fixed,
          donc hors du flux normal — sans ceci l'ordre de peinture par
          défaut d'un élément positionné n'est pas garanti rester sous ses
          voisins statiques, cf. règles de stacking CSS). */}
      <div className="connexion-form-col" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", padding: "64px clamp(28px,6vw,96px)", boxSizing: "border-box", position: "relative", zIndex: 1 }}>
        <div style={{ width: "100%", maxWidth: 440 }}>

          {/* Logo, désormais un lien vers l'accueil (2026-08-17) — /connexion
              et /inscription sont des routes "chromeless" (pas de Navbar,
              cf. SiteChrome.tsx CHROMELESS_ROUTES) : avant ce correctif, ce
              logo était purement décoratif (aria-hidden sur l'intro,
              <img> nu ici) et rien sur l'écran ne ramenait à l'accueil. */}
          <Link
            href="/"
            className="akal-logo-in akal-focusable"
            style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 40, width: "fit-content", textDecoration: "none" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/uploads/akal-logo.svg" alt="" style={{ width: 54, height: 54, display: "block" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/uploads/akal-wordmark.svg" alt="AKAL" style={{ height: 23, width: "auto", display: "block" }} />
              <span className="tifinagh" style={{ fontSize: 13, letterSpacing: "5px", color: "#8A8378" }}>ⴰⴽⴰⵍ</span>
            </div>
          </Link>

        {/* ═══ VUE ACCUEIL (Téléphone, Email & Google) ═════════════════════ */}
        {vue === "accueil" && (
          <div className="akal-rise">
            <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1B3A2D", margin: "0 0 8px" }}>
              Connexion ou inscription
            </h1>

            {/* Choix de méthode (2026-08-17) — Google reste un bouton à part
                sous les deux onglets plutôt qu'un 3e onglet : c'est un
                raccourci d'identité (aucun champ à remplir), pas un mode de
                saisie au même titre que téléphone/email. */}
            <div
              role="tablist"
              aria-label="Méthode de connexion"
              style={{ display: "flex", gap: 4, padding: 4, margin: "20px 0 20px", background: "#F0ECE3", borderRadius: "10px" }}
            >
              {(["telephone", "email"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={methode === m}
                  onClick={() => setMethode(m)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "10px",
                    border: "none",
                    borderRadius: "7px",
                    background: methode === m ? "#fff" : "transparent",
                    boxShadow: methode === m ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    color: methode === m ? "#1B3A2D" : "#8A8378",
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  {m === "telephone" ? <Phone size={15} /> : <Mail size={15} />}
                  {m === "telephone" ? "Téléphone" : "Email"}
                </button>
              ))}
            </div>

            <p style={{ fontSize: 15, color: "#8A8378", margin: "0 0 24px", lineHeight: 1.4 }}>
              {methode === "telephone"
                ? "Utilisez votre numéro de téléphone pour vous connecter rapidement"
                : modeEmail === "connexion"
                  ? "Connectez-vous avec votre email et votre mot de passe"
                  : "Créez votre compte avec une adresse email"}
            </p>

            {methode === "telephone" && (
              <>
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
              </>
            )}

            {/* ═══ Email : connexion ou création, mêmes deux endpoints déjà
                existants côté backend (login/signup), juste reliés ici pour
                la première fois — cf. AuthFormState/loginAction/signupAction
                dans app/actions/auth.ts, inchangés. ═══════════════════════ */}
            {methode === "email" && modeEmail === "connexion" && (
              <form action={loginFormAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <input type="hidden" name="next" value={next} />
                <div>
                  <label style={{ fontSize: 14, color: "#333", display: "block", marginBottom: 8 }}>Email</label>
                  <input
                    name="email"
                    type="email"
                    placeholder="vous@exemple.com"
                    required
                    autoComplete="email"
                    style={{ width: "100%", border: "1px solid #ddd", borderRadius: "8px", padding: "12px", fontSize: 16, boxSizing: "border-box" }}
                  />
                  {loginState?.fieldErrors?.email && <p style={champErreurStyle}>{loginState.fieldErrors.email[0]}</p>}
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <label style={{ fontSize: 14, color: "#333" }}>Mot de passe</label>
                    <Link href="/mot-de-passe-oublie" style={{ fontSize: 13, color: "#666" }}>Mot de passe oublié ?</Link>
                  </div>
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    style={{ width: "100%", border: "1px solid #ddd", borderRadius: "8px", padding: "12px", fontSize: 16, boxSizing: "border-box" }}
                  />
                  {loginState?.fieldErrors?.password && <p style={champErreurStyle}>{loginState.fieldErrors.password[0]}</p>}
                </div>

                {/* Message générique (ex. "Email ou mot de passe incorrect.",
                    anti-énumération — cf. commentaire ModeEmail plus haut) —
                    coexiste avec les erreurs de champ ci-dessus, ne les
                    remplace pas : un champ peut être invalide en forme
                    (fieldErrors.email) sans qu'il y ait forcément de message
                    générique, et inversement. */}
                {loginState?.error && <p style={{ fontSize: 13, color: "var(--color-erreur)", margin: 0 }}>{loginState.error}</p>}

                <button
                  type="submit"
                  disabled={loginActionPending}
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
                    cursor: loginActionPending ? "not-allowed" : "pointer",
                    opacity: loginActionPending ? 0.7 : 1,
                  }}
                >
                  {loginActionPending ? "Connexion…" : "Se connecter"}
                </button>

                <button
                  type="button"
                  onClick={() => setModeEmail("creation")}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#666", textAlign: "center", padding: 0 }}
                >
                  Pas encore de compte ?{" "}
                  <span style={{ color: "var(--color-primary, #2D6A4F)", fontWeight: 500 }}>Créer un compte</span>
                </button>
              </form>
            )}

            {methode === "email" && modeEmail === "creation" && (
              <form action={signupFormAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <input type="hidden" name="next" value={next} />
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 14, color: "#333", display: "block", marginBottom: 8 }}>Prénom</label>
                    <input
                      name="prenom"
                      type="text"
                      placeholder="Ex: Youssef"
                      required
                      autoComplete="given-name"
                      style={{ width: "100%", border: "1px solid #ddd", borderRadius: "8px", padding: "12px", fontSize: 16, boxSizing: "border-box" }}
                    />
                    {signupState?.fieldErrors?.prenom && <p style={champErreurStyle}>{signupState.fieldErrors.prenom[0]}</p>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 14, color: "#333", display: "block", marginBottom: 8 }}>Nom</label>
                    <input
                      name="nom"
                      type="text"
                      placeholder="Ex: Alaoui"
                      required
                      autoComplete="family-name"
                      style={{ width: "100%", border: "1px solid #ddd", borderRadius: "8px", padding: "12px", fontSize: 16, boxSizing: "border-box" }}
                    />
                    {signupState?.fieldErrors?.nom && <p style={champErreurStyle}>{signupState.fieldErrors.nom[0]}</p>}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 14, color: "#333", display: "block", marginBottom: 8 }}>Email</label>
                  <input
                    name="email"
                    type="email"
                    placeholder="vous@exemple.com"
                    required
                    autoComplete="email"
                    style={{ width: "100%", border: "1px solid #ddd", borderRadius: "8px", padding: "12px", fontSize: 16, boxSizing: "border-box" }}
                  />
                  {signupState?.fieldErrors?.email && <p style={champErreurStyle}>{signupState.fieldErrors.email[0]}</p>}
                </div>
                <div>
                  <label style={{ fontSize: 14, color: "#333", display: "block", marginBottom: 8 }}>Mot de passe</label>
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    style={{ width: "100%", border: "1px solid #ddd", borderRadius: "8px", padding: "12px", fontSize: 16, boxSizing: "border-box" }}
                  />
                  {signupState?.fieldErrors?.password && <p style={champErreurStyle}>{signupState.fieldErrors.password[0]}</p>}
                </div>

                {/* Message générique — coexiste avec les erreurs de champ
                    ci-dessus, même raisonnement que le formulaire de
                    connexion plus haut. */}
                {signupState?.error && <p style={{ fontSize: 13, color: "var(--color-erreur)", margin: 0 }}>{signupState.error}</p>}

                <button
                  type="submit"
                  disabled={signupActionPending}
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
                    cursor: signupActionPending ? "not-allowed" : "pointer",
                    opacity: signupActionPending ? 0.7 : 1,
                  }}
                >
                  {signupActionPending ? "Création…" : "Créer un compte"}
                </button>

                <button
                  type="button"
                  onClick={() => setModeEmail("connexion")}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#666", textAlign: "center", padding: 0 }}
                >
                  Déjà un compte ?{" "}
                  <span style={{ color: "var(--color-primary, #2D6A4F)", fontWeight: 500 }}>Se connecter</span>
                </button>
              </form>
            )}

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

      <AuthMapPanel />
    </div>
  );
}
