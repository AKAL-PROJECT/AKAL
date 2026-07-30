// Fetch authentifié centralisé — Server Actions / Route Handlers UNIQUEMENT,
// jamais depuis un Server Component (cf. lib/auth-api.ts::getCurrentUser(),
// qui ne l'utilise pas : proxy.ts gère déjà le refresh pour les routes
// protégées avant leur rendu).
//
// Ajoute Cookie + X-CSRFToken (méthodes non sûres) à chaque appel. Sur 401 :
// tente un refresh (lib/auth-refresh.ts::refreshAccessToken(), qui persiste
// les nouveaux cookies via cookies().set()) puis rejoue la requête UNE FOIS.
// Aucune logique de contournement nécessaire ici : refreshAccessToken()
// n'est appelée que dans un contexte où cookies().set() est légitime, donc
// la relecture de cookies() pour la requête rejouée reflète déjà le nouvel
// access_token (cf. sémantique Next.js : cookies().set() dans une Server
// Action met à jour immédiatement ce que les lectures suivantes voient dans
// la même requête).

import { cookies } from "next/headers";
import { refreshAccessToken } from "./auth-refresh";

async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
}

async function csrfHeader(): Promise<Record<string, string>> {
  const jar = await cookies();
  const token = jar.get("csrftoken")?.value;
  return token ? { "X-CSRFToken": token } : {};
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const methode = (options.method ?? "GET").toUpperCase();

  const appel = async (): Promise<Response> =>
    fetch(url, {
      ...options,
      cache: options.cache ?? "no-store",
      headers: {
        Cookie: await cookieHeader(),
        ...(methode !== "GET" && methode !== "HEAD" ? await csrfHeader() : {}),
        ...options.headers,
      },
    });

  const res = await appel();
  if (res.status !== 401) return res;

  const rafraichi = await refreshAccessToken();
  if (!rafraichi) return res; // session réellement terminée — on renvoie le 401 d'origine

  return appel();
}
