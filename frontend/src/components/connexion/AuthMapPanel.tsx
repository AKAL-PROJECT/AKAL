"use client";

import { useEffect, useState } from "react";
import { Check } from "@/components/icons/Icons";
import MoroccoMap from "@/components/connexion/MoroccoMap";
import { getRegions, getStatsParRegion, type Region, type StatRegion } from "@/data/parcelles";

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
//
// Sur desktop en revanche (audit du 19/08, volet 2) : traitement
// "premium" du panneau — dégradé plus profond, carte en légère élévation
// (halo), cartes d'arguments en verre dépoli, compteur réel par région au
// survol (regionCounts, cf. plus bas) plutôt qu'un simple rappel visuel.
export default function AuthMapPanel() {
  // Compteurs réels par région (nom → count), pour le survol de
  // MoroccoMap.tsx — même source que CouvertureSection.tsx (Home) :
  // getRegions() donne le nom officiel par code, getStatsParRegion() le
  // vrai total du catalogue par code (jamais un sous-échantillon paginé,
  // cf. bug corrigé le 18/08 sur ce même calcul). Échec silencieux
  // (.catch → tableau vide) délibéré : cette carte est un panneau
  // décoratif d'un écran d'authentification, jamais un point bloquant —
  // sans données, le survol reste simplement muet sur le chiffre (cf.
  // MoroccoMap.tsx), aucun repli inventé.
  const [regions, setRegions] = useState<Region[]>([]);
  const [stats, setStats] = useState<StatRegion[]>([]);
  useEffect(() => {
    getRegions().then(setRegions).catch(() => setRegions([]));
    getStatsParRegion().then(setStats).catch(() => setStats([]));
  }, []);
  const regionCounts: Record<string, number> = {};
  for (const r of regions) {
    const stat = stats.find((s) => s.code === r.code);
    if (stat) regionCounts[r.nom] = stat.count;
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
        // Dégradé approfondi (audit desktop du 19/08) — ancré vert-nuit en
        // haut à gauche plutôt qu'un simple radial beige plat, pour un rendu
        // plus "premium" tout en restant assez clair en zone centrale pour
        // que la carte et son texte de région restent lisibles.
        background: "radial-gradient(140% 100% at -10% -10%, rgba(27,58,45,0.85) 0%, rgba(45,106,79,0.35) 22%, #F6F2EB 50%, #F2ECE3 100%)",
      }}
    >
      <svg
        viewBox="0 0 600 760"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.5, pointerEvents: "none" }}
        fill="none"
        stroke="#2D6A4F"
        strokeOpacity={0.16}
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

      {/* Halo d'élévation derrière la carte (audit desktop du 19/08) — un
          radial-gradient flouté plutôt qu'un simple box-shadow autour de
          MoroccoMap : celui-ci n'a pas de fond opaque (le SVG des régions
          laisse transparaître le dégradé du panneau), un box-shadow porté
          par son conteneur n'aurait donc rien eu à "border". */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "min(70%, 420px)",
          aspectRatio: "1 / 1",
          transform: "translate(-50%,-50%)",
          background: "radial-gradient(circle, rgba(27,58,45,0.18) 0%, rgba(27,58,45,0) 68%)",
          filter: "blur(6px)",
          pointerEvents: "none",
        }}
      />

      <MoroccoMap regionCounts={regionCounts} />

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
            chiffre ni de capacité IA/satellite non disponible dans le MVP.
            Verre dépoli (backdrop-filter, audit desktop du 19/08) plutôt que
            le fond blanc quasi-opaque précédent : laisse transparaître le
            dégradé/la trame topo du panneau derrière chaque carte, cohérent
            avec le halo d'élévation de la carte ci-dessus. */}
        {/* "Statut foncier affiché", pas "vérifié" (corrigé 11 sept, même
            retour utilisateur que la Home) — AKAL ne vérifie aucun titre
            (déclaratif, cf. la FAQ de /comment-ca-marche : "AKAL vérifie-t-il
            les titres ? Non."), "vérifié" affirmait le contraire. */}
        {["Statut foncier affiché", "Sans intermédiaire", "Couverture nationale"].map((texte) => (
          <div
            key={texte}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              background: "rgba(255,255,255,0.55)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.6)",
              borderRadius: 12,
              padding: "12px 16px",
              boxShadow: "0 8px 24px rgba(27,58,45,0.10)",
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
