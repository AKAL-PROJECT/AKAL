"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import CardParcelle from "@/components/parcelles/CardParcelle";
import { ChevronLeft, ChevronRight } from "@/components/icons/Icons";
import type { Parcelle } from "@/types/parcelle";

type Props = {
  parcelles: Parcelle[];
};

// Slider horizontal "Sélection de terrains" (P1-05) — entrée directe vers le
// catalogue, plusieurs annonces cliquables. Réutilise CardParcelle telle
// quelle (mêmes cartes que /parcelles) dans une piste défilante avec
// scroll-snap ; les flèches pilotent le défilement via scrollBy, la piste
// reste aussi utilisable au doigt/trackpad nativement (pas de lib externe,
// cohérent avec Reveal.tsx qui reste JS pur).
export default function SelectionTerrainsSlider({ parcelles }: Props) {
  const pisteRef = useRef<HTMLDivElement>(null);
  const [peutReculer, setPeutReculer] = useState(false);
  const [peutAvancer, setPeutAvancer] = useState(true);

  const majFleches = () => {
    const el = pisteRef.current;
    if (!el) return;
    setPeutReculer(el.scrollLeft > 8);
    setPeutAvancer(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    majFleches();
    const el = pisteRef.current;
    if (!el) return;
    // Recalcule aussi au redimensionnement (ex. rotation mobile, resize
    // fenêtre) — la largeur visible change la disponibilité des flèches.
    const observer = new ResizeObserver(majFleches);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const defiler = (direction: 1 | -1) => {
    const el = pisteRef.current;
    if (!el) return;
    // Une "page" = largeur visible moins une carte, pour garder un léger
    // recouvrement visuel entre deux défilements (repère de continuité).
    const pas = el.clientWidth * 0.85;
    el.scrollBy({ left: direction * pas, behavior: "smooth" });
  };

  if (parcelles.length === 0) return null;

  return (
    <section style={{ padding: "0 24px", maxWidth: "1280px", margin: "0 auto clamp(64px, 10vw, 120px)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "16px",
          marginBottom: "28px",
        }}
      >
        <div>
          <span className="eyebrow">Sélection de terrains</span>
          <h2 className="display-2" style={{ color: "var(--color-nuit)", margin: "14px 0 0" }}>
            Des terres à découvrir
          </h2>
        </div>

        {/* Flèches + lien catalogue groupés à droite, masqués sur mobile
            (le défilement tactile natif suffit sous 640px). */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }} className="hidden-mobile">
          <Link href="/parcelles" className="akal-link-fleche" style={{ whiteSpace: "nowrap" }}>
            Voir tout le catalogue →
          </Link>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => defiler(-1)}
              disabled={!peutReculer}
              aria-label="Terrains précédents"
              className="akal-slider-fleche"
              style={{ opacity: peutReculer ? 1 : 0.35, cursor: peutReculer ? "pointer" : "default" }}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => defiler(1)}
              disabled={!peutAvancer}
              aria-label="Terrains suivants"
              className="akal-slider-fleche"
              style={{ opacity: peutAvancer ? 1 : 0.35, cursor: peutAvancer ? "pointer" : "default" }}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={pisteRef}
        onScroll={majFleches}
        style={{
          display: "flex",
          gap: "24px",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          paddingBottom: "8px",
          scrollbarWidth: "none",
        }}
        className="akal-slider-piste"
      >
        {parcelles.map((p, i) => (
          <div
            key={p.id}
            style={{
              flex: "0 0 clamp(260px, 32vw, 340px)",
              scrollSnapAlign: "start",
            }}
          >
            <CardParcelle parcelle={p} enComparaison={false} favori={false} index={i} />
          </div>
        ))}
      </div>

      {/* Lien catalogue visible en mobile uniquement (les flèches/lien
          desktop ci-dessus sont masqués via .hidden-mobile). */}
      <div style={{ textAlign: "center", marginTop: "24px" }} className="hidden-desktop">
        <Link href="/parcelles" className="akal-link-fleche">
          Voir tout le catalogue →
        </Link>
      </div>
    </section>
  );
}
