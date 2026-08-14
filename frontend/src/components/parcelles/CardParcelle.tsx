"use client";

import { ViewTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Parcelle } from "@/types/parcelle";
import BadgeStatut from "./BadgeStatut";
import ScoreBar from "./ScoreBar";
import { MapPin, Heart, Droplets } from "@/components/icons/Icons";
import { AGRISCORE_ACTIF } from "@/config/features";
import { formatMAD } from "@/lib/format";

const formatDate = new Intl.DateTimeFormat("fr-MA", { day: "numeric", month: "long", year: "numeric" });

type Props = {
  parcelle: Parcelle;
  enComparaison: boolean;
  // Optionnels (défaut : no-op) — une Server Component (ex. app/page.tsx) ne
  // peut pas passer de fonction à une Client Component comme celle-ci (RSC),
  // donc les usages purement décoratifs (vitrine Home, favori/comparateur
  // non pertinents) omettent ces deux props plutôt que de passer une
  // fonction vide depuis le serveur.
  onToggleComparaison?: (id: string) => void;
  favori: boolean;
  onToggleFavori?: (id: string) => void;
  // Position dans la grille — pilote le délai de l'entrée en cascade
  // (.akal-card-cascade, globals.css). Optionnel : une carte isolée hors
  // grille (ex. future page "favoris") s'anime simplement sans délai.
  index?: number;
};

export default function CardParcelle({ parcelle, enComparaison, onToggleComparaison = () => {}, favori, onToggleFavori = () => {}, index }: Props) {
  const a = parcelle;
  const image = a.photoPrincipale ?? a.photos[0] ?? null;

  return (
    <article
      className="card akal-card-cascade"
      style={{
        position: "relative",
        overflow: "hidden",
        animationDelay: index != null ? `${(index % 9) * 60}ms` : undefined,
      }}
    >
      {/* Carte cliquable dans son ensemble — le titre seul comme cible de
          clic était trop étroit ; favori/comparer restent indépendants via
          leur propre z-index + stopPropagation (pas de lien imbriqué).
          transitionTypes signale à la fiche qu'elle entre "en profondeur"
          (glissement directionnel, cf. globals.css .nav-forward / doc Next.js
          "Designing view transitions"). */}
      <Link
        href={`/parcelles/${a.slug}`}
        aria-label={`${a.titre} — ${formatMAD.format(a.prix)} MAD, ${a.parcelle.regionNom}`}
        style={{ position: "absolute", inset: 0, zIndex: 1 }}
        transitionTypes={["nav-forward"]}
      />

      {/* Photo — nommée pour le morph vers la fiche parcelle (même `name`
          que dans CarrouselPhotos.tsx). Dégrade sans animation sur les
          navigateurs sans support de la View Transitions API. */}
      <div
        style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", backgroundColor: "var(--color-menthe)", overflow: "hidden" }}
      >
        {image && (
          <ViewTransition name={`parcelle-photo-${a.id}`} share="morph">
            <Image
              src={image}
              alt={a.titre}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
              className="akal-card-photo-zoom"
              style={{ objectFit: "cover" }}
            />
          </ViewTransition>
        )}

        {/* Voile bas — assure la lisibilité des badges sur toute photo, garde
            l'univers colorimétrique de marque (cf. Hero) plutôt que le rendu
            brut de la source. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(20,30,24,0) 60%, rgba(15,22,18,0.32) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Badges en surimpression */}
        <div
          style={{
            position: "absolute",
            top: "10px",
            left: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "5px",
            alignItems: "flex-start",
          }}
        >
          {a.badge && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.02em",
                padding: "3px 9px",
                borderRadius: "var(--radius-full)",
                color: "white",
                backgroundColor: "var(--color-foret)",
                boxShadow: "var(--shadow-1)",
              }}
            >
              {a.badge}
            </span>
          )}
          <BadgeStatut statut={a.parcelle.statutFoncier} />
        </div>

        {/* Favori — persisté côté API, redirige vers /connexion si non
            authentifié (cf. hooks/useFavorisIds.ts). z-index au-dessus du
            lien plein-carte + stopPropagation pour ne pas déclencher la
            navigation en cliquant le cœur. */}
        <button
          type="button"
          aria-label={favori ? "Retirer des favoris" : "Ajouter aux favoris"}
          aria-pressed={favori}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavori(a.id);
          }}
          className="btn-icone-rond akal-focusable"
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            zIndex: 2,
            width: "30px",
            height: "30px",
            borderRadius: "var(--radius-full)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.92)",
            boxShadow: "var(--shadow-1)",
          }}
        >
          <Heart
            size={14}
            fill={favori ? "var(--color-terre)" : "none"}
            style={{ color: favori ? "var(--color-terre)" : "var(--color-tertiaire)" }}
            className={favori ? "akal-heart-burst" : undefined}
          />
        </button>
      </div>

      {/* Corps */}
      <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "9px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--color-tertiaire)" }}>
          <MapPin size={12} />
          {/* Pas d'adresse approximative en liste (allégé, contrat §4.4) — région seule ici. */}
          <span>{a.parcelle.regionNom}</span>
        </div>

        <h3 style={{ fontSize: "15px", fontWeight: 600, lineHeight: 1.3, color: "var(--color-nuit)", margin: 0 }}>
          {a.titre}
        </h3>

        <span style={{ fontSize: "11px", color: "var(--color-tertiaire)" }}>
          Publié le {formatDate.format(new Date(a.createdAt))}
        </span>

        {AGRISCORE_ACTIF && <ScoreBar score={a.scoreCourant?.scoreGlobal ?? null} />}

        {/* Tags */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          {[`${a.parcelle.surface} ha`, `${a.prixM2} MAD/m²`].map((t) => (
            <span
              key={t}
              style={{
                fontSize: "10px",
                fontWeight: 500,
                padding: "2px 8px",
                borderRadius: "var(--radius-full)",
                backgroundColor: "var(--color-menthe)",
                color: "var(--color-nuit)",
              }}
            >
              {t}
            </span>
          ))}
          {/* accesEau nullable (annonces scrapées) : comparaison explicite,
              jamais "!== bour" seul qui afficherait l'icône eau par défaut
              pour une donnée absente. */}
          {(a.parcelle.accesEau === "irriguee" || a.parcelle.accesEau === "mixte") && (
            <Droplets size={13} style={{ color: "var(--color-info)" }} aria-label="Accès à l'eau" />
          )}
        </div>

        <div style={{ height: "1px", backgroundColor: "var(--color-bordure)", margin: "2px 0" }} />

        {/* Prix + comparateur */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "18px", fontWeight: 600, color: "var(--color-foret)", fontVariantNumeric: "tabular-nums" }}>
            {formatMAD.format(a.prix)} MAD
          </span>
          <label
            style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", fontSize: "11px", color: "var(--color-tertiaire)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={enComparaison}
              onChange={() => onToggleComparaison(a.id)}
              style={{ width: "13px", height: "13px", accentColor: "var(--color-foret)" }}
            />
            Comparer
          </label>
        </div>
      </div>
    </article>
  );
}
