"use client";

import { Check } from "@/components/icons/Icons";
import MoroccoMap from "@/components/connexion/MoroccoMap";

// Panneau carte des écrans d'authentification — identique entre Connexion
// et Inscription (extrait de la duplication relevée par l'audit qualité
// technique du 2026-08-03). Purement décoratif/marketing (aucune valeur
// fonctionnelle pour l'utilisateur qui vient saisir ses identifiants) :
// masqué entièrement sous 820px depuis l'audit mobile du 19/08 (cf.
// .connexion-map-col, globals.css) — sur petit écran il repoussait le
// bouton Google et une partie du champ téléphone sous la ligne de
// flottaison, avec une rupture de fond beige/crème artificielle entre le
// bandeau et le formulaire. Le bandeau compact qui masquait ce même
// panneau sous 820px (variante `mobile`, régions sans libellés) a été
// retiré plutôt que rétréci encore : sur mobile, l'utilisateur veut
// saisir son numéro et entrer, pas un rappel de marque.
export default function AuthMapPanel() {
  return (
    <div
      className="connexion-map-col"
      style={{
        flex: 1,
        minWidth: 0,
        position: "relative",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: "44px 48px",
        boxSizing: "border-box",
        overflow: "hidden",
        borderLeft: "1px solid rgba(45,106,79,0.12)",
        background: "radial-gradient(115% 85% at 68% 32%, #EDF4EC 0%, #F6F2EB 52%, #F2ECE3 100%)",
      }}
    >
      <svg
        viewBox="0 0 600 760"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.45, pointerEvents: "none" }}
        fill="none"
        stroke="#2D6A4F"
        strokeOpacity={0.14}
        strokeWidth={1.2}
      >
        <path d="M-40 210 C120 160 240 250 360 200 S560 130 660 190" />
        <path d="M-40 250 C120 200 240 290 360 240 S560 170 660 230" />
        <path d="M-40 300 C130 250 250 340 370 290 S570 220 660 285" />
        <path d="M-40 360 C140 315 260 400 380 350 S580 285 660 350" />
        <path d="M-40 430 C150 385 270 470 390 420 S590 355 660 420" />
        <path d="M-40 510 C160 465 280 550 400 500 S600 435 660 500" />
        <path d="M-40 590 C170 545 290 630 410 580 S610 515 660 580" />
        <ellipse cx="410" cy="300" rx="150" ry="110" />
        <ellipse cx="410" cy="300" rx="105" ry="76" />
        <ellipse cx="410" cy="300" rx="62" ry="44" />
      </svg>

      <MoroccoMap />

      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
          gap: 12,
          width: "100%",
          maxWidth: 420,
        }}
        className="akal-stat-in"
      >
        {/* Mêmes affirmations que la Home (app/page.tsx) — délibérément pas de
            chiffre ni de capacité IA/satellite non disponible dans le MVP. */}
        {["Statut foncier vérifié", "Sans intermédiaire", "Couverture nationale"].map((texte) => (
          <div
            key={texte}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(45,106,79,0.16)",
              borderRadius: 12,
              padding: "12px 16px",
              boxShadow: "0 2px 10px rgba(27,58,45,0.05)",
            }}
          >
            <span style={{ display: "flex", flexShrink: 0, color: "#2D6A4F" }}>
              <Check size={18} strokeWidth={2} />
            </span>
            <span style={{ fontSize: 13, color: "#1B3A2D", fontWeight: 500 }}>{texte}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
