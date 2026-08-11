// Server Actions d'auth — lib/auth-api.ts est mocké (intégration réseau déjà
// hors périmètre, cf. convention des autres tests d'actions). redirect() de
// next/navigation est mocké pour lever une erreur portant un digest
// NEXT_REDIRECT;<url> — reproduit le vrai contrat Next.js (redirect() ne
// retourne jamais, il lève) et permet de vérifier la destination exacte sans
// dépendre d'un environnement Next.js réel.

import { afterEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import {
  loginAction,
  logoutAction,
  passwordResetConfirmAction,
  passwordResetRequestAction,
  signupAction,
} from "./auth";
import { confirmPasswordReset, login, logout, requestPasswordReset, signup } from "@/lib/auth-api";
import { ApiError } from "@/lib/api";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;push;${url};307` });
  }),
}));

vi.mock("@/lib/auth-api", () => ({
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));

const loginMock = vi.mocked(login);
const signupMock = vi.mocked(signup);
const logoutMock = vi.mocked(logout);
const requestPasswordResetMock = vi.mocked(requestPasswordReset);
const confirmPasswordResetMock = vi.mocked(confirmPasswordReset);
const redirectMock = vi.mocked(redirect);

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("loginAction", () => {
  it("succès sans next => redirige vers /compte", async () => {
    loginMock.mockResolvedValue({} as never);

    await expect(loginAction(null, formData({ email: "a@b.com", password: "x" }))).rejects.toThrow("NEXT_REDIRECT");

    expect(loginMock).toHaveBeenCalledWith({ email: "a@b.com", password: "x" });
    expect(redirectMock).toHaveBeenCalledWith("/compte");
  });

  it("succès avec next valide (commence par /) => redirige vers ce chemin précis", async () => {
    loginMock.mockResolvedValue({} as never);

    await expect(
      loginAction(null, formData({ email: "a@b.com", password: "x", next: "/messages/42" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/messages/42");
  });

  it("next invalide (ne commence pas par /, ex. URL externe) => repli sur /compte, jamais l'open redirect", async () => {
    loginMock.mockResolvedValue({} as never);

    await expect(
      loginAction(null, formData({ email: "a@b.com", password: "x", next: "https://evil.example/phish" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/compte");
  });

  it("échec (ApiError) => renvoie error + fieldErrors, ne redirige jamais", async () => {
    loginMock.mockRejectedValue(new ApiError(401, "Identifiants invalides.", null));

    const result = await loginAction(null, formData({ email: "a@b.com", password: "mauvais" }));

    expect(result).toEqual({ error: "Identifiants invalides.", fieldErrors: null });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("échec réseau (pas une ApiError) => message générique", async () => {
    loginMock.mockRejectedValue(new TypeError("fetch failed"));

    const result = await loginAction(null, formData({ email: "a@b.com", password: "x" }));

    expect(result).toEqual({ error: "Une erreur est survenue. Réessayez.", fieldErrors: null });
  });
});

describe("signupAction — cheminSuivant()", () => {
  it("succès sans next => /bienvenue (jamais /compte, pas de rôle choisi à l'inscription)", async () => {
    signupMock.mockResolvedValue({} as never);

    await expect(signupAction(null, formData({ email: "a@b.com", password: "x", nom: "N", prenom: "P" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(redirectMock).toHaveBeenCalledWith("/bienvenue");
  });

  it("succès avec next=/compte explicite => /bienvenue quand même (même règle que l'absence de next)", async () => {
    signupMock.mockResolvedValue({} as never);

    await expect(
      signupAction(null, formData({ email: "a@b.com", password: "x", nom: "N", prenom: "P", next: "/compte" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/bienvenue");
  });

  it("succès avec next précis (ex. reprendre une conversation) => prime sur l'écran de bienvenue", async () => {
    signupMock.mockResolvedValue({} as never);

    await expect(
      signupAction(null, formData({ email: "a@b.com", password: "x", nom: "N", prenom: "P", next: "/messages/42" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/messages/42");
  });

  it("téléphone absent => undefined, jamais chaîne vide envoyée à l'API", async () => {
    signupMock.mockResolvedValue({} as never);

    await expect(
      signupAction(null, formData({ email: "a@b.com", password: "x", nom: "N", prenom: "P" })),
    ).rejects.toThrow();

    expect(signupMock).toHaveBeenCalledWith(
      expect.objectContaining({ telephone: undefined }),
    );
  });

  it("échec (ApiError, ex. email déjà utilisé) => renvoie error + fieldErrors", async () => {
    signupMock.mockRejectedValue(
      new ApiError(400, "Cet email est déjà utilisé.", { email: ["Cet email est déjà utilisé."] }),
    );

    const result = await signupAction(null, formData({ email: "a@b.com", password: "x", nom: "N", prenom: "P" }));

    expect(result).toEqual({
      error: "Cet email est déjà utilisé.",
      fieldErrors: { email: ["Cet email est déjà utilisé."] },
    });
  });
});

describe("logoutAction", () => {
  it("appelle logout() puis redirige vers /", async () => {
    logoutMock.mockResolvedValue(undefined);

    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(logoutMock).toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});

describe("passwordResetRequestAction", () => {
  it("succès => envoye:true, error vide, jamais de redirect (reste sur la page pour afficher la confirmation)", async () => {
    requestPasswordResetMock.mockResolvedValue(undefined);

    const result = await passwordResetRequestAction(null, formData({ email: "a@b.com" }));

    expect(result).toEqual({ error: "", fieldErrors: null, envoye: true });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("échec (ApiError) => envoye:false, error renseignée", async () => {
    requestPasswordResetMock.mockRejectedValue(new ApiError(429, "Trop de tentatives.", null));

    const result = await passwordResetRequestAction(null, formData({ email: "a@b.com" }));

    expect(result).toEqual({ error: "Trop de tentatives.", fieldErrors: null, envoye: false });
  });
});

describe("passwordResetConfirmAction", () => {
  it("mots de passe différents => erreur immédiate, n'appelle JAMAIS confirmPasswordReset", async () => {
    const result = await passwordResetConfirmAction(
      null,
      formData({ uid: "u", token: "t", password: "abc123", password_confirmation: "different" }),
    );

    expect(result).toEqual({
      error: "Les mots de passe ne correspondent pas.",
      fieldErrors: { password_confirmation: ["Les mots de passe ne correspondent pas."] },
    });
    expect(confirmPasswordResetMock).not.toHaveBeenCalled();
  });

  it("succès => redirige vers /connexion?reinitialise=1", async () => {
    confirmPasswordResetMock.mockResolvedValue(undefined);

    await expect(
      passwordResetConfirmAction(
        null,
        formData({ uid: "u", token: "t", password: "abc123", password_confirmation: "abc123" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/connexion?reinitialise=1");
  });

  it("échec (ApiError, ex. token expiré) => renvoie error, ne redirige pas", async () => {
    confirmPasswordResetMock.mockRejectedValue(new ApiError(400, "Ce lien a expiré.", null));

    const result = await passwordResetConfirmAction(
      null,
      formData({ uid: "u", token: "t", password: "abc123", password_confirmation: "abc123" }),
    );

    expect(result).toEqual({ error: "Ce lien a expiré.", fieldErrors: null });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
