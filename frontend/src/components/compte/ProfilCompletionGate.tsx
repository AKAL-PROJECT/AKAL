"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/auth-api";
import { Phone, ChevronDown, ChevronLeft } from "@/components/icons/Icons";
import { sendPhoneSms, verifyPhoneOtp, type ConfirmationResult } from "@/lib/firebase-client";
import { COUNTRY_CODES } from "@/lib/country-codes";
import { mettreAJourProfilAction } from "@/app/actions/compte";

// ─── ProfilCompletionGate ─────────────────────────────────────────────────────
//
// Composant client qui vérifie si le profil de l'utilisateur est complet
// (prenom, nom, telephone). Si un champ manque, il affiche un écran
// intermédiaire pour le compléter avant de continuer.
//
// Usage :
//   <ProfilCompletionGate user={utilisateur} continuerUrl="/publier">
//     <DepotAnnonceWizard />
//   </ProfilCompletionGate>
//
// Si le profil est complet, les children sont rendus directement.
// ─────────────────────────────────────────────────────────────────────────────

function profilEstComplet(user: User): boolean {
  return Boolean(user.prenom && user.nom && user.telephone);
}

function champsManquants(user: User): string[] {
  const champs: string[] = [];
  if (!user.prenom) champs.push("prenom");
  if (!user.nom) champs.push("nom");
  if (!user.telephone) champs.push("telephone");
  return champs;
}

export default function ProfilCompletionGate({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const manquants = champsManquants(user);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [prenom, setPrenom] = useState(user.prenom || "");
  const [nom, setNom] = useState(user.nom || "");
  const [telephone, setTelephone] = useState(user.telephone || "");
  const [countryCode, setCountryCode] = useState("+212");

  // Nouveaux états pour le flux SMS
  const [etapeSms, setEtapeSms] = useState<"saisie" | "otp">("saisie");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [smsPending, setSmsPending] = useState(false);
  const [otpPending, setOtpPending] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const fullPhone = `${countryCode}${telephone.replace(/^0/, "").replace(/\s/g, "")}`;

  if (profilEstComplet(user)) {
    return <>{children}</>;
  }

  async function handleEnvoiSms(e: React.FormEvent) {
    e.preventDefault();
    if (!manquants.includes("telephone")) {
      // Pas besoin de SMS, on passe direct à l'enregistrement
      return finalSubmit();
    }

    setPhoneError(null);
    const digits = telephone.replace(/\s/g, "").replace(/^0/, "");
    if (!digits || digits.length < 6) {
      setPhoneError("Numéro incomplet.");
      return;
    }
    setSmsPending(true);
    try {
      const result = await sendPhoneSms(fullPhone, "recaptcha-gate-container");
      setConfirmationResult(result);
      setEtapeSms("otp");
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
        setPhoneError("Firebase: SMS désactivé pour cette région.");
      } else {
        setPhoneError("Envoi du SMS échoué. Vérifiez votre numéro.");
      }
    } finally {
      setSmsPending(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmationResult) return;
    setPhoneError(null);
    if (otpCode.length !== 6) {
      setPhoneError("Le code doit contenir 6 chiffres.");
      return;
    }
    setOtpPending(true);
    try {
      await verifyPhoneOtp(confirmationResult, otpCode);
      // OTP valide, on enregistre le tout !
      finalSubmit();
    } catch {
      setPhoneError("Code incorrect ou expiré. Réessayez.");
      setOtpPending(false);
    }
  }

  async function finalSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        if (manquants.includes("prenom") && prenom) formData.append("prenom", prenom);
        if (manquants.includes("nom") && nom) formData.append("nom", nom);
        if (manquants.includes("telephone") && telephone) formData.append("telephone", fullPhone);

        const result = await mettreAJourProfilAction(formData);
        if (result.ok) {
          router.refresh();
        } else {
          setError(result.error || "Erreur lors de la mise à jour. Réessayez.");
          setOtpPending(false);
          setSmsPending(false);
        }
      } catch (err) {
        console.error("Erreur mise à jour profil :", err);
        setError("Une erreur inattendue est survenue.");
        setOtpPending(false);
        setSmsPending(false);
      }
    });
  }

  const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#F8F5F0",
      padding: "40px 24px",
    }}>
      <div id="recaptcha-gate-container" />

      <div style={{
        width: "100%",
        maxWidth: 440,
        background: "#fff",
        borderRadius: "12px",
        padding: "40px 32px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/uploads/akal-logo.svg" alt="" style={{ width: 40, height: 40 }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/uploads/akal-wordmark.svg" alt="AKAL" style={{ height: 18, width: "auto" }} />
        </div>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#1B3A2D", margin: "0 0 8px" }}>
            Complétez votre profil
          </h1>
          <p style={{ fontSize: 14, color: "#8A8378", margin: 0, lineHeight: 1.5 }}>
            {manquants.includes("telephone")
              ? "Votre numéro est nécessaire pour que les acheteurs puissent vous contacter."
              : "Ces informations permettent de personnaliser votre expérience."}
          </p>
        </div>

        {etapeSms === "saisie" ? (
          <form onSubmit={handleEnvoiSms} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {manquants.includes("prenom") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="gate-prenom" style={{ fontSize: 13, color: "#333" }}>Prénom</label>
                <input
                  id="gate-prenom"
                  type="text"
                  placeholder="Youssef"
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
                />
              </div>
            )}

            {manquants.includes("nom") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="gate-nom" style={{ fontSize: 13, color: "#333" }}>Nom</label>
                <input
                  id="gate-nom"
                  type="text"
                  placeholder="Alaoui"
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
            )}

            {manquants.includes("telephone") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 13, color: "#333" }}>Numéro de téléphone</label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    padding: "4px",
                    background: "#fff",
                  }}
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
                    required
                    value={telephone}
                    onChange={e => setTelephone(e.target.value)}
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
              </div>
            )}

            {(error || phoneError) && (
              <p style={{ fontSize: 13, color: "var(--color-erreur)", margin: 0 }}>{error ?? phoneError}</p>
            )}

            <button
              type="submit"
              disabled={pending || smsPending}
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
                cursor: (pending || smsPending) ? "not-allowed" : "pointer",
                marginTop: 8,
              }}
            >
              {pending ? "Enregistrement…" : (manquants.includes("telephone") && telephone) ? (smsPending ? "Envoi du SMS…" : "Vérifier le numéro") : "Enregistrer et continuer"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="akal-rise" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <button type="button" onClick={() => { setEtapeSms("saisie"); setPhoneError(null); setOtpCode(""); }}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#666", padding: 0, marginBottom: 8 }}>
              <ChevronLeft size={16} /> Retour
            </button>

            <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1B3A2D", margin: 0 }}>Vérifiez votre numéro</h2>
            <p style={{ fontSize: 14, color: "#666", margin: "0 0 8px" }}>
              Code envoyé au <strong>{fullPhone}</strong>
            </p>

            <div>
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
              type="submit"
              disabled={otpPending || otpCode.length !== 6 || pending}
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
                cursor: (otpPending || otpCode.length !== 6 || pending) ? "not-allowed" : "pointer",
                marginTop: 8,
              }}
            >
              {(otpPending || pending) ? "Vérification…" : "Vérifier le code"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
