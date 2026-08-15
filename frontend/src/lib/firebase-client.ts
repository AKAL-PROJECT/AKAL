/**
 * firebase-client.ts
 *
 * Fonctions côté client pour l'authentification Firebase.
 * Utilisées uniquement dans des Client Components (never import server-side).
 *
 * - initPhoneRecaptcha()    : prépare le reCAPTCHA invisible (à appeler avant sendPhoneSms)
 * - sendPhoneSms()          : envoie le SMS OTP → ConfirmationResult
 * - verifyPhoneOtp()        : vérifie le code → idToken Firebase
 */

import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type ApplicationVerifier,
} from "firebase/auth";
import { auth } from "./firebase";

export type { ConfirmationResult };



// ─────────────────────────────────────────────────────────
declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
  }
}

export function initPhoneRecaptcha(containerId: string): ApplicationVerifier {
  // S'assurer que le container existe
  const container = document.getElementById(containerId);
  if (!container) throw new Error("reCAPTCHA container not found");

  if (!window.recaptchaVerifier) {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: "invisible",
      callback: () => {
        // reCAPTCHA résolu automatiquement
      },
    });
  } else {
    // Si la page a été re-rendue et que le container a été recréé (DOM vidé)
    if (container.innerHTML === "") {
      window.recaptchaVerifier.clear();
      window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
        size: "invisible",
      });
    }
  }

  return window.recaptchaVerifier;
}

/**
 * Envoie un SMS OTP au numéro donné via Firebase.
 *
 * @param phoneNumber  numéro E.164 (ex: "+212600000000")
 * @param containerId  id du div pour le reCAPTCHA invisible
 * @returns ConfirmationResult à passer à verifyPhoneOtp()
 */
export async function sendPhoneSms(
  phoneNumber: string,
  containerId: string
): Promise<ConfirmationResult> {
  const verifier = initPhoneRecaptcha(containerId);
  const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
  return result;
}

/**
 * Vérifie le code OTP et retourne l'idToken Firebase.
 *
 * @param confirmationResult  retour de sendPhoneSms()
 * @param code                code à 6 chiffres saisi par l'utilisateur
 * @returns idToken à envoyer au backend via phoneLoginAction()
 */
export async function verifyPhoneOtp(
  confirmationResult: ConfirmationResult,
  code: string
): Promise<string> {
  const result = await confirmationResult.confirm(code);
  const idToken = await result.user.getIdToken();
  return idToken;
}
