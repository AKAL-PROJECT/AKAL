// Client HTTP centralisé pour l'API AKAL (Django REST Framework).
//
// Objectifs :
// - une seule base URL, lue depuis NEXT_PUBLIC_API_URL ;
// - une seule façon de lire les erreurs DRF, qu'elles arrivent sous la forme
//   {"detail": "..."} (404, 403, erreurs génériques) ou sous la forme
//   {"champ": ["message", ...], ...} (400 de validation par serializer) ;
// - un type générique pour la pagination DRF standard (PageNumberPagination).
//
// cf. audit d'intégration §4.6 (contrat d'erreurs) et §3 (forme des réponses).

import { API_URL } from "./api-base";

export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

// Erreurs de validation DRF : {"prix": ["Ce champ est obligatoire."], ...}
export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldErrors | null;

  constructor(status: number, message: string, fieldErrors: FieldErrors | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

// Lit le corps d'une réponse en erreur et en extrait un message lisible.
// - {"detail": "..."} → message direct (404, 403, throttle, etc.)
// - {"champ": ["msg"], ...} → premier message de champ, + fieldErrors complet
//   pour que l'appelant puisse afficher chaque erreur au bon endroit d'un formulaire
export async function lireErreur(res: Response): Promise<{ message: string; fieldErrors: FieldErrors | null }> {
  let corps: unknown;
  try {
    corps = await res.json();
  } catch {
    return { message: res.statusText || `Erreur ${res.status}`, fieldErrors: null };
  }

  if (corps && typeof corps === "object") {
    if ("detail" in corps && typeof (corps as { detail: unknown }).detail === "string") {
      return { message: (corps as { detail: string }).detail, fieldErrors: null };
    }

    const fieldErrors = corps as FieldErrors;
    const premierChamp = Object.values(fieldErrors).find((v) => Array.isArray(v) && v.length > 0);
    return {
      message: premierChamp?.[0] ?? `Erreur ${res.status}`,
      fieldErrors,
    };
  }

  return { message: `Erreur ${res.status}`, fieldErrors: null };
}

type QueryParams = Record<string, string | number | boolean | undefined | null>;

// M-3 : pagination sur count/next/previous — ces URLs sont absolues et
// utilisables telles quelles (§4.3 du contrat), jamais recalculées à partir
// d'un numéro de page. `apiFetch("/annonces/")` comme
// `apiFetch(data.next)` doivent donc fonctionner de façon identique.
function buildUrl(path: string, params?: QueryParams): string {
  const url = /^https?:\/\//.test(path) ? new URL(path) : new URL(`${API_URL}/${path.replace(/^\/+/, "")}`);
  if (params) {
    for (const [cle, valeur] of Object.entries(params)) {
      if (valeur === undefined || valeur === null || valeur === "") continue;
      url.searchParams.set(cle, String(valeur));
    }
  }
  return url.toString();
}

export type ApiFetchOptions = Omit<RequestInit, "body"> & {
  params?: QueryParams;
  body?: unknown;
  timeout?: number;
};

// Auth : `apiFetch` sert les lectures PUBLIQUES (catalogue, fiche, géo,
// passeport), appelées côté serveur au rendu — il ne transmet volontairement
// aucun cookie ni credential. Les appels authentifiés passent par les Server
// Actions + `fetchWithAuth` (cookie JWT httpOnly + X-CSRFToken), jamais par
// ce client.
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { params, body, headers, timeout = 10000, ...rest } = options;

  let signal = rest.signal;
  if (!signal && typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    signal = AbortSignal.timeout(timeout);
  }

  try {
    const res = await fetch(buildUrl(path, params), {
      ...rest,
      signal,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const { message, fieldErrors } = await lireErreur(res);
      throw new ApiError(res.status, message, fieldErrors);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error("Le serveur met trop de temps à répondre. Vérifiez votre connexion ou réessayez plus tard.");
    }
    throw err;
  }
}
