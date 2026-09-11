"use client";

import { useEffect, useState } from "react";

type Side = "above" | "below" | "left" | "right";

type Region = {
  name: string;
  x: string;
  y: string;
  side: Side;
};

const REGIONS: Region[] = [
  { name: "Tanger-Tétouan-Al Hoceïma", x: "60%", y: "18%", side: "above" },
  // "L'Oriental", capital L — nom officiel exact renvoyé par l'API
  // (/api/geo/limites/regions/, cf. import_geo_officiel.py). Corrigé le
  // 19/08 : un "l'Oriental" en minuscule ici cassait silencieusement le
  // rapprochement par nom avec regionCounts (cf. AuthMapPanel.tsx) — cette
  // seule région se serait toujours affichée sans compteur au survol.
  { name: "L'Oriental", x: "73%", y: "24%", side: "right" },
  { name: "Rabat-Salé-Kénitra", x: "54%", y: "23%", side: "left" },
  { name: "Fès-Meknès", x: "63%", y: "27%", side: "above" },
  { name: "Béni Mellal-Khénifra", x: "61%", y: "34%", side: "right" },
  { name: "Casablanca-Settat", x: "49%", y: "33%", side: "left" },
  { name: "Marrakech-Safi", x: "49%", y: "41%", side: "left" },
  { name: "Drâa-Tafilalet", x: "65%", y: "42%", side: "right" },
  { name: "Souss-Massa", x: "46%", y: "50%", side: "left" },
  { name: "Guelmim-Oued Noun", x: "41%", y: "55%", side: "below" },
  { name: "Laâyoune-Sakia El Hamra", x: "29%", y: "67%", side: "below" },
  { name: "Dakhla-Oued Ed-Dahab", x: "17%", y: "82%", side: "below" },
];

// Régions "hub" — halo permanent plus marqué (cf. .akal-hub-ring), en plus
// du cycle automatique commun à toutes les régions ci-dessous. Bassins
// historiques du foncier agricole marocain (périurbain de Casablanca,
// plaine du Haouz autour de Marrakech, vallée du Souss autour d'Agadir),
// pas un choix arbitraire — mais pas non plus dérivé de regionCounts : ce
// dernier reflète le catalogue AKAL à un instant T (encore restreint), pas
// l'importance agricole réelle d'une région, qui elle ne bouge pas.
const HUBS = new Set(["Casablanca-Settat", "Marrakech-Safi", "Souss-Massa"]);

const LABEL_STYLE: Record<Side, React.CSSProperties> = {
  above: { position: "absolute", left: 0, top: "-11px", transform: "translate(-50%,-100%)", textAlign: "center", whiteSpace: "nowrap" },
  below: { position: "absolute", left: 0, top: "11px", transform: "translateX(-50%)", textAlign: "center", whiteSpace: "nowrap" },
  left: { position: "absolute", left: "-12px", top: 0, transform: "translate(-100%,-50%)", textAlign: "right", whiteSpace: "nowrap" },
  right: { position: "absolute", left: "12px", top: 0, transform: "translateY(-50%)", textAlign: "left", whiteSpace: "nowrap" },
};

const CYCLE_SECONDS = 4;

// `regionCounts` (nom → nombre d'annonces en_ligne, cf. getStatsParRegion) —
// optionnel et purement additif : au survol d'une région, complète son
// libellé par son vrai compteur plutôt que de laisser le survol muet. Sans
// prop (ou tant que le fetch n'a pas répondu côté AuthMapPanel.tsx), le
// survol reste silencieux sur le chiffre — jamais de nombre inventé (cf.
// commit "fix(trust): remove fabricated content from the frontend").
export default function MoroccoMap({
  regionCounts,
  onRegionClick,
}: {
  regionCounts?: Record<string, number>;
  // Optionnel — sans prop, comportement inchangé (survol uniquement). Ajouté
  // pour l'écran de connexion (calque 2a) : un clic n'y déclenche jamais de
  // navigation (cf. commentaire onMouseEnter/onMouseLeave ci-dessous, la
  // même règle vaut ici), seulement un accusé de réception visuel côté
  // appelant — voir ConnexionScreen.tsx.
  onRegionClick?: (nomRegion: string) => void;
}) {
  const [active, setActive] = useState(0);
  const [survolee, setSurvolee] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((i) => (i + 1) % REGIONS.length);
    }, CYCLE_SECONDS * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "480px", aspectRatio: "1282 / 1299" }}>
      <div
        className="akal-drift"
        style={{
          position: "absolute",
          left: "52%",
          top: "38%",
          width: "60%",
          height: "52%",
          transform: "translate(-50%,-50%)",
          background: "radial-gradient(circle, rgba(82,183,136,0.22) 0%, rgba(82,183,136,0) 70%)",
          filter: "blur(4px)",
          pointerEvents: "none",
        }}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/uploads/akal-maroc-regions.svg"
        alt="Carte des régions agricoles du Maroc"
        className="akal-drift"
        // objectFit:"contain" — le conteneur ci-dessus est déjà au ratio
        // intrinsèque du SVG (1282/1299, vérifié sur le fichier source), donc
        // ça ne change rien en temps normal. Filet de sécurité explicite
        // plutôt qu'implicite : sans lui, le moindre écart entre la hauteur
        // réellement calculée par `aspect-ratio` (arrondi sous-pixel, écarts
        // de support navigateur) et celle de l'image se traduit par un
        // rognage silencieux (object-fit par défaut = "fill") au lieu d'un
        // simple letterboxing — le sud du Maroc / Dakhla-Oued Ed-Dahab étant
        // en bas de l'image, c'est la première zone concernée (audit
        // responsive, correctif carte compacte).
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
      />

      {REGIONS.map((r, i) => {
        const isActive = i === active;
        const isHub = HUBS.has(r.name);
        const isSurvolee = survolee === r.name;
        const count = regionCounts?.[r.name];
        return (
          <div
            key={r.name}
            style={{ position: "absolute", left: r.x, top: r.y, width: 0, height: 0, cursor: onRegionClick ? "pointer" : "default" }}
            // Survol : repère visuel. Clic (optionnel, cf. onRegionClick
            // ci-dessus) : jamais une navigation — on est sur l'écran de
            // connexion, tout détour vers le catalogue ferait perdre la
            // saisie en cours (numéro/email déjà tapé) ; l'appelant ne fait
            // qu'un accusé de réception local. Sans incidence tactile : ce
            // composant n'est jamais rendu sous 820px (cf. .connexion-map-col,
            // globals.css), donc jamais sur un appareil sans souris.
            onMouseEnter={() => setSurvolee(r.name)}
            onMouseLeave={() => setSurvolee((v) => (v === r.name ? null : v))}
            onClick={onRegionClick ? () => onRegionClick(r.name) : undefined}
          >
            <div
              className="akal-pulse"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: "9px",
                height: "9px",
                borderRadius: "50%",
                background: "#C4622D",
                opacity: 0.5,
                transform: "translate(-50%,-50%)",
              }}
            />
            {isHub && (
              <div
                className="akal-hub-ring"
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  border: "1px solid rgba(45,106,79,0.45)",
                }}
              />
            )}
            {isActive && (
              <>
                <div
                  className="akal-spin"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    border: "1.5px dashed rgba(196,98,45,0.55)",
                    transform: "translate(-50%,-50%)",
                  }}
                />
                <div
                  className="akal-ring-out"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    border: "1px solid #C4622D",
                  }}
                />
              </>
            )}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: isActive || isSurvolee ? "13px" : "8px",
                height: isActive || isSurvolee ? "13px" : "8px",
                borderRadius: "50%",
                background: "#C4622D",
                opacity: isActive || isSurvolee ? 1 : 0.55,
                transform: "translate(-50%,-50%)",
                transition: "width 0.4s ease-out, height 0.4s ease-out, opacity 0.4s ease-out",
              }}
            />
            <div style={LABEL_STYLE[r.side]}>
              <div
                style={{
                  display: "inline-block",
                  background: "rgba(248,245,240,0.92)",
                  borderRadius: "5px",
                  padding: "1px 6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.3px",
                  color: "#1B3A2D",
                  opacity: isActive || isSurvolee ? 1 : 0.72,
                  transition: "opacity 0.4s ease-out",
                  boxShadow: isSurvolee ? "0 2px 8px rgba(27,58,45,0.18)" : "none",
                }}
              >
                {r.name}
                {isSurvolee && count !== undefined && (
                  <div style={{ fontSize: "10px", fontWeight: 500, color: "#2D6A4F", marginTop: "1px" }}>
                    {count} annonce{count > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
