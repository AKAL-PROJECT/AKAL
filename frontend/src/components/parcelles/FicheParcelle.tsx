"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Parcelle } from "@/types/parcelle";
import BadgeStatut from "./BadgeStatut";
import AgriScoreResume from "./passeport/AgriScoreResume";
import CarrouselPhotos from "./CarrouselPhotos";
import BlocCaracteristiques from "./BlocCaracteristiques";
import BoutonWhatsapp from "./BoutonWhatsapp";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { ContactVendeurPanel } from "@/components/messaging/ContactVendeurPanel";
import { BanniereDemo } from "@/components/BanniereDemo";
import { useFavorisIds } from "@/hooks/useFavorisIds";
import { useComparateur } from "@/hooks/useComparateur";
import { COMPARATEUR_MAX } from "./comparateurStorage";
import { formatMAD, formatPrixM2 } from "@/lib/format";
import { estSourceExterne, libelleSource } from "@/lib/annonce-source";
import { signalerVueFiche } from "@/lib/vue-beacon";
import {
  MapPin,
  Heart,
  Droplets,
  Share2,
  Check,
  ChevronLeft,
  MessageSquare,
  BarChart,
  Leaf,
  ArrowRight,
} from "@/components/icons/Icons";

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

export default function FicheParcelle({
  parcelle: a,
  estConnecte = false,
  estProprietaire = false,
}: {
  parcelle: Parcelle;
  estConnecte?: boolean;
  estProprietaire?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // `estConnecte` est déterminé côté serveur (page.tsx : `!!utilisateur`) et
  // ne change jamais après l'hydratation — l'initialiseur paresseux suffit
  // donc à lire `?contact=1` une seule fois, sans passer par un effect qui
  // appelle setState (react-hooks/set-state-in-effect). L'effect ci-dessous
  // ne fait plus que le nettoyage d'URL, un vrai effet de bord (API
  // navigateur), jamais un setState.
  const [isContactPanelOpen, setIsContactPanelOpen] = useState(
    () => searchParams.get("contact") === "1" && estConnecte
  );

  useEffect(() => {
    if (searchParams.get("contact") === "1") {
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nettoyage one-shot au montage, jamais à rejouer si searchParams change ensuite
  }, []);

  // Comptage de vue (beacon) — une fois au montage, jamais pour le
  // propriétaire regardant sa propre annonce (le dédup local + le dédup
  // backend gèrent le reste, cf. lib/vue-beacon.ts).
  useEffect(() => {
    if (!estProprietaire) signalerVueFiche(a.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot au montage
  }, []);

  const handleContactClick = () => {
    if (estConnecte) {
      setIsContactPanelOpen(true);
    } else {
      router.push(`/connexion?next=/parcelles/${a.slug}?contact=1`);
    }
  };

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

      <div style={{ marginBottom: "20px" }}>
        <BanniereDemo compact />
      </div>

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

          {/* Passeport Agronomique — un seul bloc pour le résumé (score +
              sous-scores, calculé en direct par AgriScoreResume) et l'appel à
              l'action vers l'écran complet, plutôt que deux blocs empilés.
              Distinct de "Caractéristiques de la parcelle" plus bas
              (BlocCaracteristiques, données déclaratives du vendeur) : ici,
              le vrai pipeline (5 dimensions, sources ouvertes). Traitement
              "certificat" (dégradé + bordure dédiée) : la fonctionnalité
              différenciante d'AKAL ne doit pas se fondre dans les cartes
              plates. */}
          <div
            style={{
              position: "relative",
              overflow: "hidden",
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--color-menthe)",
              background: "linear-gradient(135deg, var(--color-rosee) 0%, white 55%)",
              boxShadow: "var(--shadow-card)",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div className="akal-texture-topo" aria-hidden style={{ opacity: 0.06 }} />

            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <span style={{ width: "40px", height: "40px", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-foret)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 10px rgba(45,106,79,0.28)" }}>
                <Leaf size={18} />
              </span>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-nuit)" }}>Passeport Agronomique</div>
                <AgriScoreResume
                  variante="detaille"
                  parcelleId={a.parcelle.id}
                  slug={a.slug}
                  accesEau={a.parcelle.accesEau}
                />
              </div>
              <Link
                href={`/parcelles/${a.slug}/passeport`}
                className="btn-primary akal-focusable"
                style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", whiteSpace: "nowrap" }}
              >
                Analyser le potentiel
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          <BlocCaracteristiques parcelle={a} />

          {/* Description */}
          <section>
            <h2 className="fiche-section-titre">Description</h2>
            <p style={{ fontSize: "14px", lineHeight: 1.75, color: "var(--color-secondaire)", margin: 0, whiteSpace: "pre-line" }}>
              {a.description}
            </p>
          </section>

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
                {formatPrixM2(a.prixM2)} · {a.parcelle.surface} ha
              </div>
            </div>

            <div style={{ height: "1px", backgroundColor: "var(--color-bordure)" }} />

            {/* CTAs — pour une annonce importée d'une source externe (Avito,
                Mubawab), le « propriétaire » est un compte bot d'import :
                ni messagerie AKAL ni WhatsApp, on renvoie vers l'annonce
                d'origine. cf. lib/annonce-source.ts + backend
                EnvoyerMessageSerializer.validate_annonce. */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {estSourceExterne(a.source) ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    padding: "14px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-bordure)",
                    backgroundColor: "var(--color-fond-input)",
                  }}
                >
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-texte)" }}>
                    Annonce issue d&apos;une source externe
                  </div>
                  <p style={{ fontSize: "12.5px", color: "var(--color-secondaire)", margin: 0, lineHeight: 1.5 }}>
                    Cette annonce a été importée depuis {libelleSource(a.source)}. Elle n&apos;a pas été
                    déposée par un vendeur sur AKAL — la messagerie et le contact WhatsApp AKAL ne sont
                    pas disponibles.
                  </p>
                  {a.sourceUrl && (
                    <a
                      href={a.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="akal-focusable"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-foret)" }}
                    >
                      Voir l&apos;annonce d&apos;origine →
                    </a>
                  )}
                </div>
              ) : (
                <>
              <button
                onClick={handleContactClick}
                className="btn-primary"
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", textDecoration: "none" }}
              >
                <MessageSquare size={15} />
                Contacter le vendeur
              </button>
              <p style={{ fontSize: "12px", color: "var(--color-tertiaire)", textAlign: "center", margin: 0 }}>
                Échange direct avec le vendeur, sans intermédiaire.
              </p>

              {/* Contact WhatsApp — second canal, en plus de la messagerie
                  interne ci-dessus. Le numéro n'existe nulle part côté front
                  (cf. BoutonWhatsapp) : `whatsappDisponible` dit seulement si
                  le vendeur en a un, le lien wa.me est demandé au clic via une
                  action authentifiée. */}
              <BoutonWhatsapp
                variant="full"
                disponible={a.whatsappDisponible}
                annonceId={a.id}
                slug={a.slug}
                estConnecte={estConnecte}
              />
                </>
              )}
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
            {formatPrixM2(a.prixM2)}
          </div>
        </div>
        {estSourceExterne(a.source) ? (
          a.sourceUrl ? (
            <a
              href={a.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              style={{ flex: 1, textAlign: "center", textDecoration: "none" }}
            >
              Voir l&apos;annonce d&apos;origine
            </a>
          ) : (
            <span style={{ flex: 1, textAlign: "center", fontSize: "12px", color: "var(--color-tertiaire)" }}>
              Annonce d&apos;une source externe
            </span>
          )
        ) : (
          <>
        <button
          onClick={handleContactClick}
          className="btn-primary"
          style={{ flex: 1, textAlign: "center", textDecoration: "none" }}
        >
          Contacter
        </button>
        {/* Version compacte (icône seule) — largeur fixe pour laisser la
            priorité visuelle à "Contacter" dans une barre déjà à l'étroit. */}
        <BoutonWhatsapp
          variant="compact"
          disponible={a.whatsappDisponible}
          annonceId={a.id}
          slug={a.slug}
          estConnecte={estConnecte}
        />
          </>
        )}
      </div>
      <ContactVendeurPanel
        parcelle={a} 
        isOpen={isContactPanelOpen} 
        onClose={() => setIsContactPanelOpen(false)} 
      />
    </div>
  );
}

