"use server";

import { redirect } from "next/navigation";
import { ApiError, type FieldErrors } from "@/lib/api";
import { login, logout, signup, type SignupInput } from "@/lib/auth-api";

export type AuthFormState = {
  error: string;
  fieldErrors: FieldErrors | null;
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

  // Pas de rôle choisi à l'inscription : on montre systématiquement l'écran
  // de bienvenue plutôt que /compte, même si un `next` était présent (un
  // compte qui vient d'être créé n'a pas encore de contexte "explorer" vs
  // "déposer une annonce" à retrouver).
  redirect("/bienvenue");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/");
}
