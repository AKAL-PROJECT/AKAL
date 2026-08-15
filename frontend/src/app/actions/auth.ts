"use server";

import { redirect } from "next/navigation";
import { ApiError, type FieldErrors } from "@/lib/api";
import { confirmPasswordReset, googleLogin, login, logout, phoneLoginVerify, requestPasswordReset, signup, type SignupInput } from "@/lib/auth-api";

export type AuthFormState = {
  error: string;
  fieldErrors: FieldErrors | null;
} | null;

export type PasswordResetRequestFormState = {
  error: string;
  fieldErrors: FieldErrors | null;
  envoye: boolean;
} | null;

function cheminSuivant(formData: FormData): string {
  const next = formData.get("next");
  return typeof next === "string" && next.startsWith("/") ? next : "/compte";
}

export async function loginAction(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await login({ email, password });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, fieldErrors: err.fieldErrors };
    return { error: "Une erreur est survenue. Réessayez.", fieldErrors: null };
  }

  redirect(cheminSuivant(formData));
}

export async function signupAction(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const input: SignupInput = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    nom: String(formData.get("nom") ?? ""),
    prenom: String(formData.get("prenom") ?? ""),
    telephone: String(formData.get("telephone") ?? "") || undefined,
  };

  try {
    await signup(input);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, fieldErrors: err.fieldErrors };
    return { error: "Une erreur est survenue. Réessayez.", fieldErrors: null };
  }

  // Pas de rôle choisi à l'inscription : un `next` par défaut (/compte, ie.
  // aucune intention connue) montre l'écran de bienvenue plutôt qu'un
  // dashboard vide, pour laisser choisir "explorer" vs "déposer une
  // annonce". Un `next` précis (reprendre une conversation, finaliser un
  // dépôt...) prime en revanche sur cet écran : c'est l'intention réelle qui
  // a amené à s'inscrire, la perdre serait pire que l'absence de contexte de
  // rôle.
  const chemin = cheminSuivant(formData);
  redirect(chemin === "/compte" ? "/bienvenue" : chemin);
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/");
}

// ─── Google OAuth ───────────────────────────────────────────────────────────

export async function googleLoginAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { error: "Jeton Google manquant.", fieldErrors: null };

  try {
    await googleLogin(token);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, fieldErrors: err.fieldErrors };
    return { error: "Connexion Google échouée. Réessayez.", fieldErrors: null };
  }

  redirect(cheminSuivant(formData));
}

// ─── Téléphone / SMS OTP ────────────────────────────────────────────────────

export async function phoneLoginAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "");
  const prenom = String(formData.get("prenom") ?? "");
  const nom = String(formData.get("nom") ?? "");
  if (!token) return { error: "Jeton Firebase manquant.", fieldErrors: null };

  try {
    await phoneLoginVerify(token, prenom || undefined, nom || undefined);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, fieldErrors: err.fieldErrors };
    return { error: "Vérification OTP échouée. Réessayez.", fieldErrors: null };
  }

  redirect(cheminSuivant(formData));
}

export async function passwordResetRequestAction(
  _prevState: PasswordResetRequestFormState,
  formData: FormData,
): Promise<PasswordResetRequestFormState> {
  const email = String(formData.get("email") ?? "");

  try {
    await requestPasswordReset({ email });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, fieldErrors: err.fieldErrors, envoye: false };
    return { error: "Une erreur est survenue. Réessayez.", fieldErrors: null, envoye: false };
  }

  return { error: "", fieldErrors: null, envoye: true };
}

export async function passwordResetConfirmAction(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const uid = String(formData.get("uid") ?? "");
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");

  if (password !== confirmation) {
    return {
      error: "Les mots de passe ne correspondent pas.",
      fieldErrors: { password_confirmation: ["Les mots de passe ne correspondent pas."] },
    };
  }

  try {
    await confirmPasswordReset({ uid, token, password });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, fieldErrors: err.fieldErrors };
    return { error: "Une erreur est survenue. Réessayez.", fieldErrors: null };
  }

  redirect("/connexion?reinitialise=1");
}
