"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Parcelle } from "@/types/parcelle";
import BadgeStatut from "./BadgeStatut";
import ScoreBar from "./ScoreBar";
import CarrouselPhotos from "./CarrouselPhotos";
import BlocCaracteristiques from "./BlocCaracteristiques";
import SimulateurROI from "./SimulateurROI";
import { useFavorisIds } from "@/hooks/useFavorisIds";
import { useComparateur } from "@/hooks/useComparateur";
import { COMPARATEUR_MAX } from "./comparateurStorage";
import { formatMAD } from "@/lib/format";
import {
  MapPin,
  Heart,
  Droplets,
  Share2,
  Check,
  ChevronLeft,
  MessageSquare,
  BarChart,
} from "@/components/icons/Icons";
import { AGRISCORE_ACTIF } from "@/config/features";

const formatDate = new Intl.DateTimeFormat("fr-MA", { day: "numeric", month: "long", year: "numeric" });

const CarteFiche = dynamic(() => import("./CarteLeafletFiche"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100%",
        borderRadius: "var(--radius-card)",
        backgroundColor: "var(--color-menthe)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-foret)",
        fontSize: "14px",
      }}
    >
      Chargement de la carte…
    </div>
  ),
});

function agriScoreLegende(score: number | null): string {
  if (score == null) return "AgriScore en cours de calcul pour cette parcelle.";
  if (score >= 75) return "Excellentes conditions agropédologiques. Sol fertile, bonne rétention hydrique.";
  if (score >= 50) return "Conditions correctes. Quelques aménagements peuvent améliorer le potentiel.";
  return "Potentiel limité. Convient à des cultures extensives ou à la pâture.";
}

export default function FicheParcelle({ parcelle: a }: { parcelle: Parcelle }) {
  const { favorisIds, toggleFavori } = useFavorisIds();
  const favori = favorisIds.has(a.id);
  const [lienCopie, setLienCopie] = useState(false);
  // Comparateur (P1-01) — deuxième point d'entrée voulu par Baroud, en plus
  // du catalogue/favoris : même liste partagée (hooks/useComparateur.ts),
  // donc une parcelle ajoutée ici apparaît immédiatement dans la barre du
  // catalogue si l'utilisateur y retourne.
  const { parcelles: parcellesComparees, basculer: basculerComparaison, estEnComparaison, estComplet } = useComparateur();
  const enComparaison = estEnComparaison(a.id);

  // navigator.share() (mobile/OS) avec repli sur la copie du lien — les deux
  // sont des capacités déjà natives du navigateur, aucune dépendance ajoutée.
  const partager = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: a.titre, url });
      } catch {
        // Partage annulé par l'utilisateur — rien à faire.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setLienCopie(true);
      setTimeout(() => setLienCopie(false), 2000);
    } catch {
      // Presse-papiers indisponible — rien à faire de plus côté interface.
    }
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 20px 64px" }}>

      {/* Fil d'Ariane */}
      <nav
        aria-label="Fil d'Ariane"
        className="akal-fade-in"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          color: "var(--color-tertiaire)",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ color: "var(--color-tertiaire)", textDecoration: "none" }}>
          Accueil
        </Link>
        <span>/</span>
        <Link
          href="/parcelles"
          style={{ color: "var(--color-tertiaire)", textDecoration: "none" }}
          transitionTypes={["nav-back"]}
        >
          Catalogue
        </Link>
        <span>/</span>
        <span style={{ color: "var(--color-texte)" }}>{a.titre}</span>
      </nav>

      {/* Retour (mobile only) */}
      <Link
        href="/parcelles"
        className="hidden-desktop"
        style={{ alignItems: "center", gap: "6px", fontSize: "14px", color: "var(--color-foret)", textDecoration: "none", marginBottom: "16px" }}
        transitionTypes={["nav-back"]}
      >
        <ChevronLeft size={16} />
        Retour au catalogue
      </Link>

      {/* ── Layout 2 colonnes ────────────────────────────────────── */}
      <div className="fiche-layout">

        {/* Colonne principale — .akal-stagger porte le rythme d'entrée de
            chaque bloc (délai par nth-child, cf. globals.css), plus posé
            que le fade simultané précédent. */}
        <div className="akal-stagger" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "28px" }}>

          {/* Carrousel photos — id porte le nom du morph partagé avec la
              photo de la carte catalogue (CardParcelle.tsx). */}
          <div>
            <CarrouselPhotos photos={a.photos} titre={a.titre} badge={a.badge} id={a.id} />
          </div>

          {/* Titre + localisation + badges */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <BadgeStatut statut={a.parcelle.statutFoncier} />
              {/* accesEau nullable (annonces scrapées) : comparaison explicite,
                  jamais "!== bour" seul qui afficherait l'icône eau par défaut
                  pour une donnée absente. */}
              {(a.parcelle.accesEau === "irriguee" || a.parcelle.accesEau === "mixte") && (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 10px",
                    borderRadius: "var(--radius-full)",
                    fontSize: "12px",
                    fontWeight: 500,
                    backgroundColor: "var(--color-info-fond)",
                    color: "var(--color-info)",
                  }}
                >
                  <Droplets size={11} />
                  Irriguée
                </span>
              )}
            </div>

            <h1 style={{ fontSize: "32px", fontWeight: 500, color: "var(--color-nuit)", lineHeight: 1.25, margin: 0 }}>
              {a.titre}
            </h1>

            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "var(--color-tertiaire)" }}>
              <MapPin size={14} />
              <span>
                {a.parcelle.adresseApproximative ?? a.parcelle.regionNom}
                {a.parcelle.adresseApproximative && `, ${a.parcelle.regionNom}`}
                {" · "}
                {a.parcelle.surface} ha
                {" · "}
                Publié le {formatDate.format(new Date(a.datePublication ?? a.createdAt))}
              </span>
            </div>
          </div>

          {/* AgriScore — hors périmètre produit actuel (cf. src/config/features.ts).
              Bloc conservé intact, simplement non rendu, pour une réactivation
              triviale (un seul booléen) le jour où la fonctionnalité revient. */}
          {AGRISCORE_ACTIF && (
            <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-texte)" }}>AgriScore</span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--color-tertiaire)",
                    backgroundColor: "var(--color-fond-input)",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)",
                  }}
                >
                  Indice agronomique / 100
                </span>
              </div>
              <ScoreBar score={a.scoreCourant?.scoreGlobal ?? null} />
              <p style={{ fontSize: "12px", color: "var(--color-secondaire)", margin: 0 }}>
                {agriScoreLegende(a.scoreCourant?.scoreGlobal ?? null)}
              </p>
            </div>
          )}

          <BlocCaracteristiques parcelle={a} />

          {/* Description */}
          <section>
            <h2 className="fiche-section-titre">Description</h2>
            <p style={{ fontSize: "14px", lineHeight: 1.75, color: "var(--color-secondaire)", margin: 0, whiteSpace: "pre-line" }}>
              {a.description}
            </p>
          </section>

          <SimulateurROI prix={a.prix} />

          {/* Localisation */}
          <section>
            <h2 className="fiche-section-titre">Localisation</h2>
            <div style={{ height: "320px", borderRadius: "var(--radius-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
              <CarteFiche parcelle={a} />
            </div>
          </section>
        </div>

        {/* ── Colonne contact (sticky) ─────────────────────────── */}
        <aside className="fiche-aside">
          <div className="card akal-fade-in" style={{ position: "relative", overflow: "hidden", padding: "24px", display: "flex", flexDirection: "column", gap: "20px", animationDelay: "80ms" }}>
            {/* Trame parcellaire cadastrale — même signature graphique que le
                Hero (globals.css .akal-texture-cadastre), très discrète
                derrière le bloc contact. */}
            <div className="akal-texture-cadastre" aria-hidden />

            {/* Prix */}
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: "22px", fontWeight: 500, color: "var(--color-foret)", fontVariantNumeric: "tabular-nums" }}>
                {formatMAD.format(a.prix)} MAD
              </div>
              <div style={{ fontSize: "13px", color: "var(--color-tertiaire)", marginTop: "4px" }}>
                {a.prixM2} MAD/m² · {a.parcelle.surface} ha
              </div>
            </div>

            <div style={{ height: "1px", backgroundColor: "var(--color-bordure)" }} />

            {/* CTAs */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Link
                href={`/messages/nouveau?annonce=${a.slug}`}
                className="btn-primary"
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", textDecoration: "none" }}
              >
                <MessageSquare size={15} />
                Contacter le vendeur
              </Link>
              <p style={{ fontSize: "12px", color: "var(--color-tertiaire)", textAlign: "center", margin: 0 }}>
                Échange direct avec le vendeur, sans intermédiaire.
              </p>
            </div>

            <div style={{ height: "1px", backgroundColor: "var(--color-bordure)" }} />

            {/* Favoris + partager */}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                aria-pressed={favori}
                onClick={() => toggleFavori(a.id)}
                className="akal-focusable"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "10px",
                  borderRadius: "var(--radius-sm)",
                  border: `1px solid ${favori ? "var(--color-terre)" : "var(--color-bordure)"}`,
                  backgroundColor: favori ? "var(--color-terre-fond)" : "transparent",
                  color: favori ? "var(--color-terre-texte)" : "var(--color-secondaire)",
                  fontSize: "13px",
                  cursor: "pointer",
                  transition: "all 200ms ease",
                }}
              >
                <Heart size={14} fill={favori ? "var(--color-terre)" : "none"} className={favori ? "akal-heart-burst" : undefined} />
                {favori ? "Sauvegardé" : "Sauvegarder"}
              </button>
              <button
                type="button"
                onClick={partager}
                className="akal-focusable"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "10px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-bordure)",
                  backgroundColor: "transparent",
                  color: "var(--color-secondaire)",
                  fontSize: "13px",
                  cursor: "pointer",
                  transition: "background-color 200ms ease",
                }}
              >
                {lienCopie ? <Check size={14} /> : <Share2 size={14} />}
                {lienCopie ? "Lien copié !" : "Partager"}
              </button>
            </div>

            {/* Comparateur (P1-01) — deuxième point d'entrée en plus du
                catalogue/favoris, cf. hooks/useComparateur.ts. Désactivé
                seulement si le plafond est atteint SANS que cette parcelle
                en fasse déjà partie (sinon on ne pourrait plus la retirer
                depuis ici une fois le plafond atteint ailleurs). */}
            <button
              type="button"
              aria-pressed={enComparaison}
              disabled={estComplet && !enComparaison}
              onClick={() => basculerComparaison(a)}
              className="akal-focusable"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "10px",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${enComparaison ? "var(--color-foret)" : "var(--color-bordure)"}`,
                backgroundColor: enComparaison ? "var(--color-rosee)" : "transparent",
                color: enComparaison ? "var(--color-foret)" : "var(--color-secondaire)",
                fontSize: "13px",
                cursor: estComplet && !enComparaison ? "default" : "pointer",
                opacity: estComplet && !enComparaison ? 0.5 : 1,
                transition: "all 200ms ease",
              }}
            >
              <BarChart size={14} />
              {enComparaison ? "Dans le comparateur" : "Ajouter au comparateur"}
            </button>
            {parcellesComparees.length > 0 && (
              <p style={{ fontSize: "12px", color: "var(--color-secondaire)", textAlign: "center", margin: 0 }}>
                {parcellesComparees.length}/{COMPARATEUR_MAX} sélectionnées ·{" "}
                <Link href="/comparateur" style={{ color: "var(--color-foret)", fontWeight: 500 }}>
                  Voir le comparateur →
                </Link>
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* ── Barre contact fixe mobile ──────────────────────────── */}
      <div
        className="hidden-desktop akal-bar-in"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          backgroundColor: "white",
          borderTop: "1px solid var(--color-bordure)",
          padding: "12px 16px",
          alignItems: "center",
          gap: "12px",
          boxShadow: "0 -4px 16px rgba(17,26,21,0.10)",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "18px", fontWeight: 500, color: "var(--color-foret)", fontVariantNumeric: "tabular-nums" }}>
            {formatMAD.format(a.prix)} MAD
          </div>
          <div style={{ fontSize: "12px", color: "var(--color-tertiaire)" }}>
            {a.prixM2} MAD/m²
          </div>
        </div>
        <Link
          href={`/messages/nouveau?annonce=${a.slug}`}
          className="btn-primary"
          style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, textDecoration: "none" }}
        >
          <MessageSquare size={14} />
          Contacter
        </Link>
      </div>
    </div>
  );
}
