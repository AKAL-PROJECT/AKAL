// Server Actions de messagerie — lib/messaging-api.ts mocké (intégration
// réseau hors périmètre). Les actions de polling (fetchInboxAction,
// fetchMessagesAction) ne doivent JAMAIS lever : un poll raté doit être
// ignoré silencieusement (retour null), pas casser l'affichage — c'est le
// comportement documenté en tête du fichier source, exactement ce que ce
// test vérifie.

import { afterEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { demarrerConversationAction, envoyerReponseAction, fetchInboxAction, fetchMessagesAction } from "./messaging";
import { demarrerConversation, envoyerReponse, fetchInbox, fetchMessages } from "@/lib/messaging-api";
import { ApiError } from "@/lib/api";
import type { Conversation, Message } from "@/types/messaging";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;push;${url};307` });
  }),
}));

vi.mock("@/lib/messaging-api", () => ({
  demarrerConversation: vi.fn(),
  envoyerReponse: vi.fn(),
  fetchInbox: vi.fn(),
  fetchMessages: vi.fn(),
}));

const demarrerConversationMock = vi.mocked(demarrerConversation);
const envoyerReponseMock = vi.mocked(envoyerReponse);
const fetchInboxMock = vi.mocked(fetchInbox);
const fetchMessagesMock = vi.mocked(fetchMessages);
const redirectMock = vi.mocked(redirect);

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("demarrerConversationAction", () => {
  it("succès => redirige vers /messages/<id de la conversation créée>", async () => {
    demarrerConversationMock.mockResolvedValue({ id: "conv-42" } as Conversation);

    await expect(
      demarrerConversationAction(null, formData({ annonce: "annonce-1", contenu: "Bonjour, intéressé." })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(demarrerConversationMock).toHaveBeenCalledWith("annonce-1", "Bonjour, intéressé.");
    expect(redirectMock).toHaveBeenCalledWith("/messages/conv-42");
  });

  it("échec (ApiError) => renvoie error + fieldErrors, ne redirige jamais", async () => {
    demarrerConversationMock.mockRejectedValue(
      new ApiError(400, "Vous ne pouvez pas vous contacter vous-même.", null),
    );

    const result = await demarrerConversationAction(null, formData({ annonce: "annonce-1", contenu: "Salut" }));

    expect(result).toEqual({ error: "Vous ne pouvez pas vous contacter vous-même.", fieldErrors: null });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("échec réseau (pas une ApiError) => message générique", async () => {
    demarrerConversationMock.mockRejectedValue(new TypeError("fetch failed"));

    const result = await demarrerConversationAction(null, formData({ annonce: "annonce-1", contenu: "Salut" }));

    expect(result).toEqual({ error: "Une erreur est survenue. Réessayez.", fieldErrors: null });
  });
});

describe("envoyerReponseAction", () => {
  it("succès => { message, error: null }", async () => {
    const message = { id: "msg-1", contenu: "Réponse" } as Message;
    envoyerReponseMock.mockResolvedValue(message);

    const result = await envoyerReponseAction("conv-42", "Réponse");

    expect(result).toEqual({ message, error: null });
    expect(envoyerReponseMock).toHaveBeenCalledWith("conv-42", "Réponse");
  });

  it("échec (ApiError) => { message: null, error: <message de l'erreur> }, jamais de throw", async () => {
    envoyerReponseMock.mockRejectedValue(new ApiError(429, "Trop de messages envoyés.", null));

    const result = await envoyerReponseAction("conv-42", "Spam");

    expect(result).toEqual({ message: null, error: "Trop de messages envoyés." });
  });

  it("échec réseau (pas une ApiError) => message générique", async () => {
    envoyerReponseMock.mockRejectedValue(new TypeError("fetch failed"));

    const result = await envoyerReponseAction("conv-42", "Réponse");

    expect(result).toEqual({ message: null, error: "Une erreur est survenue. Réessayez." });
  });
});

describe("fetchInboxAction — polling, ne doit jamais lever", () => {
  it("succès => renvoie le résultat paginé", async () => {
    const inbox = { count: 1, next: null, previous: null, results: [{ id: "conv-1" }] } as never;
    fetchInboxMock.mockResolvedValue(inbox);

    const result = await fetchInboxAction();

    expect(result).toBe(inbox);
  });

  it("échec (n'importe quelle erreur) => null, jamais d'exception qui casserait le poll", async () => {
    fetchInboxMock.mockRejectedValue(new ApiError(500, "Erreur serveur.", null));

    const result = await fetchInboxAction();

    expect(result).toBeNull();
  });
});

describe("fetchMessagesAction — polling, ne doit jamais lever", () => {
  it("succès => renvoie la liste des messages", async () => {
    const messages = [{ id: "msg-1" }] as Message[];
    fetchMessagesMock.mockResolvedValue(messages);

    const result = await fetchMessagesAction("conv-42");

    expect(result).toBe(messages);
    expect(fetchMessagesMock).toHaveBeenCalledWith("conv-42");
  });

  it("échec (n'importe quelle erreur) => null, jamais d'exception qui casserait le poll", async () => {
    fetchMessagesMock.mockRejectedValue(new TypeError("fetch failed"));

    const result = await fetchMessagesAction("conv-42");

    expect(result).toBeNull();
  });
});
