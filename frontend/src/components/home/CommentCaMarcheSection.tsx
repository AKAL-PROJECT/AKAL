"use client";

import { useState } from "react";
import { Reveal } from "@/components/Reveal";

// Deux parcours distincts (acheteur / vendeur) plutôt qu'un unique
// "Comment ça marche" acheteur-only — AKAL sert les deux côtés du marché
// (recherche de parcelle ET dépôt d'annonce), la home ne montrait jusqu'ici
// que le premier. Bascule à onglets pour garder la section aussi compacte
// qu'avant (un seul parcours de 3 étapes visible à la fois), plutôt que de
// doubler sa hauteur avec les deux parcours empilés.
const PARCOURS = {
  acheteur: {
    label: "Vous achetez",
    etapes: [
      { num: "01", titre: "Explorez", desc: "Parcourez des parcelles partout au Maroc, avec leur statut foncier déclaré. Filtrez par région et budget." },
      { num: "02", titre: "Comparez", desc: "Statut foncier, accès à l'eau, prix au m² — comparez les parcelles côte à côte." },
      { num: "03", titre: "Contactez", desc: "Échangez directement avec le vendeur, sans intermédiaire." },
    ],
  },
  vendeur: {
    label: "Vous vendez",
    etapes: [
      { num: "01", titre: "Déposez", desc: "Décrivez votre parcelle, localisez-la sur la carte et ajoutez vos photos — en 3 étapes." },
      { num: "02", titre: "Échangez", desc: "Recevez les messages des acheteurs intéressés, directement, sans intermédiaire." },
      { num: "03", titre: "Vendez", desc: "Marquez l'annonce vendue une fois la transaction conclue, depuis votre tableau de bord." },
    ],
  },
} as const;

type Cible = keyof typeof PARCOURS;

export default function CommentCaMarcheSection() {
  const [cible, setCible] = useState<Cible>("acheteur");
  const { etapes } = PARCOURS[cible];

  return (
    <section id="comment-ca-marche" style={{ maxWidth: "1000px", margin: "0 auto clamp(64px, 10vw, 120px)", padding: "0 24px" }}>
      <Reveal>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <span className="eyebrow" style={{ justifyContent: "center" }}>Fonctionnement</span>
          <h2 className="display-2" style={{ color: "var(--color-nuit)", margin: "14px 0 0" }}>Comment ça marche</h2>
        </div>
      </Reveal>

      <Reveal delayMs={60}>
        <div
          role="tablist"
          aria-label="Parcours acheteur ou vendeur"
          style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "48px" }}
        >
          {(Object.keys(PARCOURS) as Cible[]).map((cle) => {
            const active = cible === cle;
            return (
              <button
                key={cle}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCible(cle)}
                className="akal-focusable"
                style={{
                  padding: "10px 22px",
                  borderRadius: "var(--radius-full)",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                  backgroundColor: active ? "var(--color-foret)" : "white",
                  color: active ? "white" : "var(--color-texte)",
                  border: active ? "none" : "1px solid var(--color-bordure)",
                  transition: "background-color 150ms ease, color 150ms ease",
                }}
              >
                {PARCOURS[cle].label}
              </button>
            );
          })}
        </div>
      </Reveal>

      <div style={{ position: "relative" }}>
        <svg viewBox="0 0 1000 20" style={{ width: "100%", height: "20px", position: "absolute", top: "32px", left: 0 }} preserveAspectRatio="none">
          <line x1="100" y1="10" x2="900" y2="10" stroke="var(--color-menthe)" strokeWidth={2} strokeLinecap="round" />
        </svg>
        <div key={cible} style={{ display: "flex", gap: "24px", justifyContent: "space-between", position: "relative", zIndex: 2, flexWrap: "wrap" }}>
          {etapes.map(({ num, titre, desc }, i) => (
            <Reveal key={titre} delayMs={i * 90}>
              <div style={{ width: "220px", maxWidth: "100%", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", margin: "0 auto" }}>
                <div style={{ width: "64px", height: "64px", borderRadius: "50%", backgroundColor: "var(--color-foret)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: 500, boxShadow: "var(--shadow-2)" }}>
                  {num}
                </div>
                <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-nuit)" }}>{titre}</div>
                <div style={{ fontSize: "14px", color: "var(--color-secondaire)", lineHeight: 1.5 }}>{desc}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
