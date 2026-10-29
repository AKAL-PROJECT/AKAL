// En-têtes ajoutés à chaque appel SERVEUR Next.js → Django (BFF).
//
// 1. `Origin` — le fetch de Node n'envoie ni Origin ni Referer. En HTTPS,
//    CsrfViewMiddleware de Django rejette alors toute requête non sûre
//    (« Referer checking failed - no Referer ») : sans cet en-tête, toutes
//    les écritures authentifiées et le refresh de session partaient en 403
//    en production (audit S1). La valeur doit figurer dans
//    CSRF_TRUSTED_ORIGINS côté backend (même URL que le site).
//
// 2. `X-Akal-Proxy-Secret` + `X-Akal-Client-IP` — vus de Django, tous les
//    appels BFF viennent de l'IP du serveur Next : sans l'IP du visiteur,
//    le rate-limiting DRF était partagé par tous les utilisateurs (audit
//    S2 : 5 inscriptions/h pour tout le site). Django ne croit l'IP
//    transmise que si le secret partagé correspond (akal/middleware.py).
//
// Module sans import de `next/headers` : utilisable depuis proxy.ts et
// depuis lib/api.ts (partagé client/serveur). Les Server Actions passent par
// lib/entetes-backend-serveur.ts, qui lit la requête entrante ; le rendu
// serveur public (apiFetch) n'envoie que Origin + secret.

const SITE_ORIGIN = (() => {
  const brut = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  try {
    return new URL(brut).origin;
  } catch {
    return "http://localhost:3000";
  }
})();

// Nombre de proxys de confiance devant le serveur Next (Render : 1). L'IP
// retenue est celle ajoutée par le proxy le plus proche — jamais l'entrée la
// plus à gauche de X-Forwarded-For, que le client peut forger.
function nombreProxysConfiance(): number {
  const n = Number(process.env.AKAL_TRUSTED_PROXY_COUNT ?? "1");
  return Number.isInteger(n) && n >= 0 ? n : 1;
}

const RE_IP = /^[0-9a-fA-F:.]{2,45}$/;

type EntetesLisibles = { get(name: string): string | null };

export function ipClient(entrants: EntetesLisibles | null | undefined): string | null {
  if (!entrants) return null;
  const xff = entrants.get("x-forwarded-for");
  const n = nombreProxysConfiance();
  if (xff && n > 0) {
    const adresses = xff.split(",").map((a) => a.trim()).filter(Boolean);
    const candidate = adresses[Math.max(0, adresses.length - n)];
    if (candidate && RE_IP.test(candidate)) return candidate;
  }
  const reelle = entrants.get("x-real-ip")?.trim();
  return reelle && RE_IP.test(reelle) ? reelle : null;
}

export function entetesBackend(entrants?: EntetesLisibles | null): Record<string, string> {
  const entetes: Record<string, string> = { Origin: SITE_ORIGIN };
  const secret = process.env.AKAL_PROXY_SECRET;
  if (secret) {
    entetes["X-Akal-Proxy-Secret"] = secret;
    const ip = ipClient(entrants);
    if (ip) entetes["X-Akal-Client-IP"] = ip;
  }
  return entetes;
}
