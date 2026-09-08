// Base de l'API AKAL (Django REST Framework), résolue selon le contexte
// d'exécution — source unique, importée par tous les clients (`lib/*-api.ts`,
// `proxy.ts`, `data/parcelles.ts`…).
//
//   • Navigateur : `NEXT_PUBLIC_API_URL` (inliné au build) — l'URL joignable
//     depuis le poste du visiteur (ex. http://localhost:8000/api).
//   • Serveur (Server Components, Server Actions, middleware `proxy.ts`) :
//     `API_URL_INTERNAL` s'il est défini — l'URL joignable depuis le
//     réseau interne (ex. http://backend:8000/api en docker-compose, ou le
//     réseau privé Render) —, sinon la même valeur que le navigateur.
//
// `API_URL_INTERNAL` n'est volontairement PAS préfixé `NEXT_PUBLIC_` : c'est
// une variable d'environnement runtime côté serveur, jamais exposée au
// navigateur. En dev local classique (front et back sur localhost), aucune
// des deux n'est nécessaire — le défaut `http://localhost:8000/api` suffit.

// `||` (pas `??`) : une variable définie mais vide (`NEXT_PUBLIC_API_URL=`)
// doit se comporter comme non définie, pas produire une URL vide.
const PUBLIC = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/+$/, "");
const INTERNAL = (process.env.API_URL_INTERNAL || PUBLIC).replace(/\/+$/, "");

export const API_URL = typeof window === "undefined" ? INTERNAL : PUBLIC;
