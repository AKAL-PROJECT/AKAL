"use client";

import { useState, useCallback, useEffect, ViewTransition } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Images, X } from "@/components/icons/Icons";

type Props = {
  photos: string[];
  titre: string;
  badge?: string | null;
  // Identifiant de la parcelle — porte le nom du morph partagé avec la photo
  // du catalogue (CardParcelle.tsx, même `parcelle-photo-${id}`).
  id: string;
};

// Galerie : grille "1 grande photo + 4 miniatures" sur desktop (badge "Voir
// les N photos" sur la dernière miniature), 1 seule photo pleine largeur sur
// mobile. Le clic sur n'importe quelle photo ouvre une visionneuse plein
// écran qui réutilise la navigation clavier/flèches — aucune fonctionnalité
// perdue par rapport à l'ancien carrousel inline, juste déplacée en overlay.
export default function CarrouselPhotos({ photos, titre, badge, id }: Props) {
  const [actif, setActif] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const n = photos.length;

  const precedent = useCallback(() => setActif((i) => (i - 1 + n) % n), [n]);
  const suivant = useCallback(() => setActif((i) => (i + 1) % n), [n]);

  useEffect(() => {
    if (!ouvert) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") precedent();
      if (e.key === "ArrowRight") suivant();
      if (e.key === "Escape") setOuvert(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [ouvert, precedent, suivant]);

  if (n === 0) return null;

  const ouvrirSur = (i: number) => {
    setActif(i);
    setOuvert(true);
  };

  // Grille adaptative selon le nombre de miniatures disponibles (le contrat
  // ne garantit aucun nombre minimum de photos) — évite des cellules de
  // grille vides quand il y a moins de 4 miniatures (cas courant : 2).
  const shown = Math.min(n - 1, 4);
  const miniatures = photos.slice(1, 1 + shown);
  const nbCachees = n - 5;
  const rows = shown >= 2 ? 2 : 1;
  const colonnes = shown >= 3 ? "2fr 1fr 1fr" : "2fr 1fr";

  return (
    <>
      {/* ── Grille desktop : 1 grande + jusqu'à 4 miniatures ─────────── */}
      {n > 1 ? (
        <div
          className="hidden-mobile"
          style={{
            display: "grid",
            gridTemplateColumns: colonnes,
            gridTemplateRows: rows === 2 ? "1fr 1fr" : "1fr",
            gap: "6px",
            height: "420px",
            borderRadius: "var(--radius-card)",
            overflow: "hidden",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <button
            type="button"
            onClick={() => ouvrirSur(0)}
            aria-label={`Voir ${titre} en plein écran`}
            style={{ position: "relative", gridColumn: "1", gridRow: rows === 2 ? "1 / 3" : "1", border: "none", padding: 0, cursor: "pointer" }}
          >
            <ViewTransition name={`parcelle-photo-${id}`} share="morph">
              <Image src={photos[0]} alt={titre} fill priority sizes="60vw" style={{ objectFit: "cover" }} />
            </ViewTransition>
            {badge && (
              <span
                style={{
                  position: "absolute",
                  top: "12px",
                  left: "12px",
                  fontSize: "11px",
                  fontWeight: 500,
                  padding: "4px 10px",
                  borderRadius: "var(--radius-full)",
                  color: "white",
                  backgroundColor: "var(--color-foret)",
                }}
              >
                {badge}
              </span>
            )}
          </button>

          {miniatures.map((src, i) => {
            const estDerniere = i === miniatures.length - 1;
            return (
              <button
                key={src}
                type="button"
                onClick={() => ouvrirSur(i + 1)}
                aria-label={estDerniere ? `Voir les ${n} photos` : `Voir photo ${i + 2}`}
                style={{ position: "relative", border: "none", padding: 0, cursor: "pointer" }}
              >
                <Image src={src} alt="" fill sizes="20vw" style={{ objectFit: "cover" }} />
                {estDerniere && (
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      backgroundColor: "rgba(27,58,45,0.55)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      color: "white",
                      fontSize: "13px",
                      fontWeight: 500,
                    }}
                  >
                    <Images size={15} />
                    Voir les {n} photos{nbCachees > 0 ? ` (+${nbCachees})` : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div
          className="hidden-mobile"
          style={{ position: "relative", height: "420px", borderRadius: "var(--radius-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}
        >
          <ViewTransition name={`parcelle-photo-${id}`} share="morph">
            <Image src={photos[0]} alt={titre} fill priority sizes="65vw" style={{ objectFit: "cover" }} />
          </ViewTransition>
          {badge && (
            <span
              style={{
                position: "absolute", top: "12px", left: "12px", fontSize: "11px", fontWeight: 500,
                padding: "4px 10px", borderRadius: "var(--radius-full)", color: "white", backgroundColor: "var(--color-foret)",
              }}
            >
              {badge}
            </span>
          )}
        </div>
      )}

      {/* ── Mobile : une seule photo pleine largeur, miniatures masquées ── */}
      <button
        type="button"
        onClick={() => ouvrirSur(0)}
        aria-label={`Voir ${titre} en plein écran`}
        className="hidden-desktop"
        style={{
          position: "relative",
          width: "100%",
          height: "260px",
          borderRadius: "var(--radius-card)",
          overflow: "hidden",
          boxShadow: "var(--shadow-card)",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      >
        {/* Pas de ViewTransition ici : la variante desktop ci-dessus reste
            montée en permanence dans le DOM (masquée en CSS via
            .hidden-mobile/.hidden-desktop, pas démontée) — deux
            <ViewTransition> partageant le même `name` en même temps fait
            planter React (cf. audit visuel, correctif). Le morph carte→fiche
            reste donc porté par la seule variante desktop ; sur mobile, la
            navigation se fait simplement sans animation de morph, comme les
            autres dégradations déjà prévues pour cette fonctionnalité. */}
        <Image src={photos[0]} alt={titre} fill priority sizes="100vw" style={{ objectFit: "cover" }} />
        {badge && (
          <span
            style={{
              position: "absolute", top: "12px", left: "12px", fontSize: "11px", fontWeight: 500,
              padding: "4px 10px", borderRadius: "var(--radius-full)", color: "white", backgroundColor: "var(--color-foret)",
            }}
          >
            {badge}
          </span>
        )}
        {n > 1 && (
          <span
            style={{
              position: "absolute", bottom: "12px", right: "12px", display: "flex", alignItems: "center", gap: "6px",
              fontSize: "12px", fontWeight: 500, padding: "4px 10px", borderRadius: "var(--radius-full)",
              backgroundColor: "rgba(0,0,0,0.55)", color: "white",
            }}
          >
            <Images size={13} />
            Voir les {n} photos
          </span>
        )}
      </button>

      {/* ── Visionneuse plein écran ───────────────────────────────────── */}
      {ouvert && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photos de ${titre}`}
          className="akal-pop-in"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            backgroundColor: "rgba(15,20,17,0.94)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px" }}>
            <span style={{ color: "white", fontSize: "13px", letterSpacing: "0.03em" }}>
              {actif + 1} / {n}
            </span>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              aria-label="Fermer la visionneuse"
              className="btn-icone-rond akal-focusable"
              style={{
                width: "36px", height: "36px", borderRadius: "50%", border: "none",
                backgroundColor: "rgba(255,255,255,0.12)", color: "white", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
            <Image
              src={photos[actif]}
              alt={`${titre} — photo ${actif + 1} sur ${n}`}
              fill
              sizes="100vw"
              style={{ objectFit: "contain" }}
            />

            {n > 1 && (
              <>
                <button
                  type="button"
                  onClick={precedent}
                  aria-label="Photo précédente"
                  className="btn-icone-rond akal-focusable"
                  style={{
                    position: "absolute", left: "16px", top: "50%", marginTop: "-20px",
                    width: "40px", height: "40px", borderRadius: "50%", border: "none",
                    backgroundColor: "rgba(255,255,255,0.88)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <ChevronLeft size={20} style={{ color: "var(--color-nuit)" }} />
                </button>
                <button
                  type="button"
                  onClick={suivant}
                  aria-label="Photo suivante"
                  className="btn-icone-rond akal-focusable"
                  style={{
                    position: "absolute", right: "16px", top: "50%", marginTop: "-20px",
                    width: "40px", height: "40px", borderRadius: "50%", border: "none",
                    backgroundColor: "rgba(255,255,255,0.88)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <ChevronRight size={20} style={{ color: "var(--color-nuit)" }} />
                </button>
              </>
            )}
          </div>

          {n > 1 && (
            <div style={{ display: "flex", gap: "6px", padding: "12px 20px 20px", overflowX: "auto" }}>
              {photos.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setActif(i)}
                  aria-label={`Voir photo ${i + 1}`}
                  aria-pressed={i === actif}
                  style={{
                    flexShrink: 0, width: "64px", height: "48px", borderRadius: "var(--radius-xs)", overflow: "hidden",
                    position: "relative", border: `2px solid ${i === actif ? "var(--color-prairie)" : "transparent"}`,
                    cursor: "pointer", padding: 0, opacity: i === actif ? 1 : 0.5,
                    transition: "opacity 150ms ease, border-color 150ms ease",
                  }}
                >
                  <Image src={src} alt="" fill sizes="64px" style={{ objectFit: "cover" }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
