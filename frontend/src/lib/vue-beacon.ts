// Beacon de comptage de vue de fiche — appelé une fois au montage de
// /parcelles/<slug> (FicheParcelle, composant client).
//
// Pourquoi côté client : la fiche est générée en SSG (generateStaticParams,
// app/parcelles/[slug]/page.tsx). Un comptage côté backend sur
// GET /api/annonces/<slug>/ ne verrait que les fetch de build, jamais les
// vrais visiteurs — il faut un signal émis depuis le navigateur.
//
// - Déduplication locale 6 h (localStorage) : couvre le rechargement, la
//   navigation arrière et le double-montage de React en mode strict (dev).
//   Le backend re-déduplique de son côté sur 24 h (IP + User-Agent, cf.
//   EnregistrerVueAPIView) — cette garde-ci évite juste des requêtes inutiles.
// - Fire-and-forget : toute erreur (hors ligne, 404, throttle, CORS) est
//   avalée. Un compteur de vues ne doit jamais dégrader l'affichage de la
//   fiche ni bloquer le rendu.
// - POST sans en-tête ni corps → requête « simple » au sens CORS, pas de
//   préflight ; `keepalive` pour survivre à une navigation immédiate.

import { API_URL } from "./api-base";

const FENETRE_DEDUP_MS = 6 * 60 * 60 * 1000;

export function signalerVueFiche(annonceId: string): void {
  if (typeof window === "undefined" || !annonceId) return;

  const cle = `akal:vue:${annonceId}`;
  try {
    const precedent = window.localStorage.getItem(cle);
    if (precedent && Date.now() - Number(precedent) < FENETRE_DEDUP_MS) return;
    window.localStorage.setItem(cle, String(Date.now()));
  } catch {
    // localStorage indisponible (navigation privée stricte, quota dépassé) —
    // on tente quand même le beacon, le backend déduplique.
  }

  try {
    void fetch(`${API_URL}/annonces/${annonceId}/vue/`, {
      method: "POST",
      keepalive: true,
    }).catch(() => {});
  } catch {
    // `fetch` absent (très vieux navigateur) ou URL invalide — sans effet.
  }
}
