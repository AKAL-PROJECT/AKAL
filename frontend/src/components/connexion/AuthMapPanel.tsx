"use client";

import { Check } from "@/components/icons/Icons";
import MoroccoMap, { NOMBRE_REGIONS } from "@/components/connexion/MoroccoMap";

// Panneau carte des écrans d'authentification — identique entre Connexion
// et Inscription (extrait de la duplication relevée par l'audit qualité
// technique du 2026-08-03). Deux variantes, PAS un seul composant qui
// rendrait les deux : .connexion-shell est en flex-direction row sur
// desktop (le panneau doit suivre le formulaire dans le DOM) mais column
// sous 820px (le bandeau compact doit précéder le formulaire) — sans
// `order` CSS, les deux morceaux doivent donc rester deux appels séparés,
// placés chacun à sa position réelle par l'appelant (cf. ConnexionScreen.tsx).
export default function AuthMapPanel({ variant }: { variant: "mobile" | "desktop" }) {
  if (variant === "mobile") {
    return (
      <div
        className="connexion-map-mobile"
        style={{
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "28px 24px",
          background: "rgba(232,201,154,0.28)",
        }}
      >
        <MoroccoMap variant="compact" />
        {/* Micro-label optionnel (correctif carte compacte, audit responsive) :
            les libellés de région disparaissent sur cette variante compacte
            (illisibles à cette taille, cf. MoroccoMap.tsx) — cette seule
            ligne compense un peu l'information perdue sans réintroduire les
            12 libellés individuels. S'insère dans le flex-column existant
            (gap déjà présent), aucun redesign du bandeau. */}
        <span style={{ fontSize: 12, color: "#2D6A4F", fontWeight: 500 }}>
          {NOMBRE_REGIONS} régions couvertes
        </span>
      </div>
    );
  }

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
