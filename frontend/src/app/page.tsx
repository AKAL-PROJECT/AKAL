"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { PARCELLES } from "@/data/parcelles";
import CardParcelle from "@/components/parcelles/CardParcelle";
import ScoreBar from "@/components/parcelles/ScoreBar";
import BadgeStatut from "@/components/parcelles/BadgeStatut";
import { Reveal } from "@/components/Reveal";
import { Search, Shield, Check, Map as MapIcon, MessageSquare, ArrowRight, MapPin } from "@/components/icons/Icons";
import { AGRISCORE_ACTIF } from "@/config/features";
import type { RegionActive } from "@/components/parcelles/CarteCouvertureLeaflet";

// Leaflet touche `window`, absent au rendu serveur (SSR) — chargement
// client uniquement, même contrainte que CarteParcelles.tsx.
const CarteCouverture = dynamic(() => import("@/components/parcelles/CarteCouvertureLeaflet"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--color-menthe)", color: "var(--color-foret)", fontSize: "14px" }}>
      Chargement de la carte…
    </div>
  ),
});

// cf. REGIONS_MOCK dans data/parcelles.ts — mêmes codes/libellés.
const REGIONS = [
  { code: "casablanca-settat", nom: "Casablanca-Settat" },
  { code: "meknes-tafilalet", nom: "Meknès-Tafilalet" },
  { code: "souss-massa", nom: "Souss-Massa" },
  { code: "rabat-sale-kenitra", nom: "Rabat-Salé-Kénitra" },
  { code: "oriental", nom: "Oriental" },
];

// Compteur + centre par région pour le panneau/la carte de couverture (Home) —
// dérivés des vraies parcelles (moyenne lat/lng), jamais codés en dur. `centre`
// est null si la région n'a aucune parcelle (le bouton reste cliquable, la
// carte retombe alors sur la vue Maroc entière).
function statsParRegion(parcelles: typeof PARCELLES, regions: typeof REGIONS) {
  return regions.map((r) => {
    const items = parcelles.filter((p) => p.parcelle.regionNom === r.nom);
    const centre: [number, number] | null = items.length
      ? [
          items.reduce((s, p) => s + p.parcelle.latitude, 0) / items.length,
          items.reduce((s, p) => s + p.parcelle.longitude, 0) / items.length,
        ]
      : null;
    return { code: r.code, nom: r.nom, count: items.length, centre };
  });
}

const CONFIANCE = [
  { icone: Shield, titre: "Statut foncier vérifié", desc: "Melkia, Soulaliya, Guich, Habous, Immatriculé — clairement identifié sur chaque annonce." },
  { icone: Check, titre: "Sans intermédiaire", desc: "Un espace de mise en relation directe entre propriétaires et acheteurs." },
  { icone: MapIcon, titre: "Couverture nationale", desc: "Des parcelles à travers les régions agricoles du Maroc." },
];

const ETAPES = [
  { num: "01", titre: "Explorez", desc: "Parcourez des parcelles vérifiées partout au Maroc. Filtrez par région et budget." },
  { num: "02", titre: "Comparez", desc: "Statut foncier, accès à l'eau, prix au m² — comparez les parcelles côte à côte." },
  { num: "03", titre: "Contactez", desc: "Échangez directement avec le vendeur, sans intermédiaire." },
];

const RAISONS = [
  { icone: Search, titre: "Une vision claire", desc: "Toutes les informations essentielles réunies au même endroit." },
  { icone: Shield, titre: "Plus de transparence", desc: "Comprenez le statut et les caractéristiques d'une parcelle avant d'aller plus loin." },
  { icone: MessageSquare, titre: "Des échanges directs", desc: "Un espace pour mettre en relation propriétaires et acheteurs, sans intermédiaire." },
];

export default function Home() {
  const vedettes = PARCELLES.slice(0, 3);
  const parcelleVitrine = vedettes[0];

  const [regionCode, setRegionCode] = useState<string | null>(null);
  const statsRegions = statsParRegion(PARCELLES, REGIONS);
  const regionActive: RegionActive = regionCode
    ? statsRegions.find((r) => r.code === regionCode) ?? null
    : null;

  return (
    <div>
      {/* ═══════════════════════ Hero — Découverte ═══════════════════════ */}
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          backgroundColor: "var(--color-fond)",
        }}
      >
        <div className="akal-texture-topo" aria-hidden style={{ opacity: 0.4 }} />

        <div
          className="akal-hero-grid"
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 0.95fr)",
            alignItems: "stretch",
          }}
        >
          {/* Colonne texte — posée sur une trame parcellaire cadastrale
              ultra-discrète (grille de bornage + bornes), cf. .akal-texture-cadastre. */}
          <div
            style={{
              position: "relative",
              padding: "clamp(48px, 8vw, 96px) clamp(28px, 5vw, 64px) clamp(56px, 8vw, 88px) clamp(24px, 6vw, 64px)",
            }}
          >
            <div className="akal-texture-cadastre" aria-hidden />

            <div style={{ position: "relative", maxWidth: "620px" }}>
              <span className="eyebrow akal-push-up" style={{ animationDelay: "0ms" }}>
                Marketplace foncière — Maroc
              </span>

              <h1
                className="display-1 akal-push-up"
                style={{ color: "var(--color-nuit)", margin: "18px 0 20px", animationDelay: "80ms" }}
              >
                La terre, sans zones d&apos;ombre.
              </h1>

              <p
                className="lede akal-push-up"
                style={{ maxWidth: "460px", margin: "0 0 32px", animationDelay: "160ms" }}
              >
                AKAL réunit statut foncier vérifié, données agronomiques et échanges directs — pour
                aborder la terre agricole marocaine en toute clarté.
              </p>

              {/* Objet posé — fond translucide + ombre longue, sans bordure dure
                  (remplace le liseré .color-bordure par un ring via box-shadow). */}
              <form
                action="/parcelles"
                method="GET"
                className="akal-push-up"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  padding: "8px",
                  maxWidth: "540px",
                  backgroundColor: "rgba(255,255,255,0.85)",
                  backdropFilter: "blur(6px)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "0 24px 56px -24px rgba(27,58,45,0.38), 0 0 0 1px rgba(27,58,45,0.07)",
                  animationDelay: "240ms",
                }}
              >
                <label style={{ display: "block", flex: "1 1 140px" }}>
                  <span className="sr-only">Région</span>
                  <select name="region" className="select-chevron akal-hero-field" style={{ ...heroFieldStyle, width: "100%" }} defaultValue="">
                    <option value="">Région</option>
                    {REGIONS.map((r) => (
                      <option key={r.code} value={r.code}>{r.nom}</option>
                    ))}
                  </select>
                </label>
                <div style={{ width: "1px", alignSelf: "stretch", backgroundColor: "var(--color-bordure)" }} className="hidden-mobile" />
                <label style={{ display: "block", flex: "1 1 140px" }}>
                  <span className="sr-only">Budget maximum en dirhams</span>
                  <input name="prix_max" type="number" placeholder="Budget max (MAD)" className="akal-hero-field" style={{ ...heroFieldStyle, width: "100%" }} />
                </label>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <Search size={16} />
                  Rechercher
                </button>
              </form>

              <Link
                href="#comment-ca-marche"
                className="akal-push-up"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "var(--color-foret)",
                  fontSize: "14px",
                  fontWeight: 500,
                  marginTop: "24px",
                  textDecoration: "none",
                  animationDelay: "300ms",
                }}
              >
                Comment ça marche
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          {/* Colonne visuelle — photo aérienne plein bleed, fondue vers la
              colonne texte (cf. .akal-hero-fondu). Visible aussi en mobile
              (pleine largeur, empilée sous le texte via .akal-hero-grid en
              1 colonne sous 900px). */}
          <div className="akal-hero-visuel akal-push-up" style={{ animationDelay: "200ms" }}>
            {/* Fichier à déposer par vos soins : frontend/public/images/hero-parcelles.jpg
                (non versionné ici, cf. compte-rendu). */}
            <Image
              src="/images/hero-parcelles.jpg"
              alt="Vue aérienne de parcelles agricoles marocaines, cultures et chemins délimitant les propriétés"
              fill
              priority
              sizes="(max-width: 900px) 100vw, 48vw"
              style={{ objectFit: "cover" }}
            />

            {/* Teinte de marque — unifie la photo à la palette AKAL. */}
            <div
              aria-hidden
              style={{ position: "absolute", inset: 0, backgroundColor: "var(--color-foret)", mixBlendMode: "multiply", opacity: 0.28 }}
            />

            {/* Fondu gauche — raccorde le bord de l'image au fond de la colonne texte. */}
            <div className="akal-hero-fondu" aria-hidden />

            {/* Voile bas — asseoit la carte catalogue ancrée, transparent en haut, nuit ~82% en bas. */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(180deg, rgba(27,58,45,0) 0%, rgba(27,58,45,0.25) 55%, rgba(27,58,45,0.82) 100%)",
              }}
            />

            {/* Lignes de relief — signature de marque, conservée en léger overlay au-dessus de la photo. */}
            <svg
              aria-hidden
              viewBox="0 0 520 640"
              width="100%"
              height="100%"
              preserveAspectRatio="xMidYMid slice"
              style={{ position: "absolute", inset: 0 }}
            >
              <g fill="none" stroke="var(--color-menthe)" strokeOpacity={0.35} strokeWidth={1.2}>
                <path d="M-30 90 C 90 40,190 140,290 90 S 470 30,560 100" />
                <path d="M-30 190 C 100 145,200 245,300 195 S 480 130,560 200" />
                <path d="M-30 300 C 110 255,210 355,310 305 S 490 240,560 310" />
                <path d="M-30 420 C 120 375,220 475,320 425 S 500 360,560 430" />
                <path d="M-30 540 C 130 495,230 595,330 545 S 510 480,560 550" />
              </g>
            </svg>

            {/* Pastilles de statut foncier (positions indicatives — à ajuster
                une fois la vraie photo en place pour tomber sur des parcelles
                visibles). Vert = Immatriculé, terre = autre statut. */}
            <span
              aria-hidden
              style={{ position: "absolute", left: "38%", top: "30%", width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "var(--color-prairie)", transform: "translate(-50%,-50%)", boxShadow: "0 0 0 2px rgba(255,255,255,0.5)" }}
            />
            <span
              className="akal-pulse"
              aria-hidden
              style={{ position: "absolute", left: "38%", top: "30%", width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "var(--color-prairie)", opacity: 0.5, transform: "translate(-50%,-50%)" }}
            />
            <span
              aria-hidden
              style={{ position: "absolute", left: "63%", top: "58%", width: "9px", height: "9px", borderRadius: "50%", backgroundColor: "var(--color-terre)", transform: "translate(-50%,-50%)", boxShadow: "0 0 0 2px rgba(255,255,255,0.5)" }}
            />

            {/* Carte catalogue — ancrée en bas-gauche de l'image plein bleed ;
                vraie parcelle du catalogue, pas de statistique inventée. */}
            {parcelleVitrine && (
              <div
                className="akal-chip-donnee akal-pop-in"
                style={{
                  position: "absolute",
                  left: "24px",
                  bottom: "24px",
                  right: "24px",
                  maxWidth: "320px",
                  padding: "18px",
                  animationDelay: "520ms",
                }}
              >
                <div style={{ fontSize: "11px", color: "var(--color-tertiaire)", marginBottom: "4px" }}>
                  Exemple du catalogue
                </div>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-nuit)", marginBottom: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {parcelleVitrine.titre}
                </div>
                {AGRISCORE_ACTIF ? (
                  // AgriScore hors périmètre actuel (cf. src/config/features.ts) —
                  // chip d'origine conservée intacte, juste non rendue.
                  <ScoreBar score={parcelleVitrine.scoreCourant?.scoreGlobal ?? null} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--color-tertiaire)" }}>
                      <MapPin size={12} />
                      {parcelleVitrine.parcelle.regionNom}
                    </span>
                    <BadgeStatut statut={parcelleVitrine.parcelle.statutFoncier} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ Confiance ═══════════════════════ */}
      <Reveal>
        <section style={{ borderTop: "1px solid var(--color-bordure)", borderBottom: "1px solid var(--color-bordure)" }}>
          <div
            style={{
              maxWidth: "1100px",
              margin: "0 auto",
              padding: "40px 24px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "32px",
            }}
          >
            {CONFIANCE.map(({ icone: Icone, titre, desc }) => (
              <div key={titre} style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0, width: "36px", height: "36px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--color-rosee)", color: "var(--color-foret)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-1)" }}>
                  <Icone size={17} strokeWidth={1.75} />
                </span>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-nuit)", marginBottom: "3px" }}>{titre}</div>
                  <div style={{ fontSize: "13px", color: "var(--color-secondaire)", lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ═══════════════════════ Valeur — couverture ═══════════════════════ */}
      <section style={{ maxWidth: "1400px", margin: "clamp(64px, 10vw, 120px) auto", padding: "0 24px" }}>
        <Reveal>
          <div style={{ maxWidth: "620px", marginBottom: "32px" }}>
            <span className="eyebrow">Couverture nationale</span>
            <h2 className="display-2" style={{ color: "var(--color-nuit)", margin: "14px 0 16px" }}>
              La terre n&apos;est jamais loin.
            </h2>
            <p className="lede" style={{ margin: 0 }}>
              Explorez les {PARCELLES.length} parcelles disponibles à travers le Maroc, région par région.
              Sélectionnez une zone pour recentrer la carte.
            </p>
          </div>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="akal-couverture-grid" style={{ display: "grid", gridTemplateColumns: "minmax(240px, 300px) minmax(0, 1fr)", gap: "20px", alignItems: "stretch" }}>
            {/* Panneau régions — compteurs dérivés de statsParRegion (jamais codés en dur). */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setRegionCode(null)}
                aria-pressed={regionCode === null}
                className="akal-region-btn akal-focusable"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md)",
                  textAlign: "left",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                  backgroundColor: regionCode === null ? "var(--color-foret)" : "white",
                  color: regionCode === null ? "white" : "var(--color-texte)",
                  border: regionCode === null ? "none" : "1px solid var(--color-bordure)",
                }}
              >
                <span>Tout le Maroc</span>
                <span
                  style={{
                    minWidth: "24px",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)",
                    fontSize: "12px",
                    fontWeight: 600,
                    textAlign: "center",
                    backgroundColor: regionCode === null ? "rgba(255,255,255,0.2)" : "var(--color-rosee)",
                    color: regionCode === null ? "white" : "var(--color-foret)",
                  }}
                >
                  {PARCELLES.length}
                </span>
              </button>

              {statsRegions.map((r) => {
                const active = regionCode === r.code;
                return (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => setRegionCode(active ? null : r.code)}
                    aria-pressed={active}
                    className="akal-region-btn akal-focusable"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      padding: "12px 16px",
                      borderRadius: "var(--radius-md)",
                      textAlign: "left",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: "pointer",
                      backgroundColor: active ? "var(--color-foret)" : "white",
                      color: active ? "white" : "var(--color-texte)",
                      border: active ? "none" : "1px solid var(--color-bordure)",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <MapPin size={14} style={{ color: active ? "var(--color-ble)" : "var(--color-foret)", opacity: active ? 1 : 0.6, flexShrink: 0 }} />
                      {r.nom}
                    </span>
                    <span
                      style={{
                        minWidth: "24px",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full)",
                        fontSize: "12px",
                        fontWeight: 600,
                        textAlign: "center",
                        backgroundColor: active ? "rgba(255,255,255,0.2)" : "var(--color-rosee)",
                        color: active ? "white" : "var(--color-foret)",
                      }}
                    >
                      {r.count}
                    </span>
                  </button>
                );
              })}

              {/* CTA vers l'onglet Carte de la Navbar — même route ("/parcelles"),
                  pas de paramètre dédié pour présélectionner la vue carte :
                  le catalogue n'a pas de mode piloté par l'URL (mode local,
                  cf. app/parcelles/page.tsx), atterrit donc en vue grille. */}
              <Link href="/parcelles" className="akal-link-fleche" style={{ marginTop: "8px" }}>
                Voir la carte complète →
              </Link>
            </div>

            {/* Carte */}
            <div
              style={{
                position: "relative",
                height: "480px",
                borderRadius: "var(--radius-xl)",
                overflow: "hidden",
                boxShadow: "var(--shadow-2)",
              }}
            >
              <CarteCouverture parcelles={PARCELLES} regionActive={regionActive} />
            </div>
          </div>
        </Reveal>
      </section>

      {/* ═══════════════════════ Fonctionnalités ═══════════════════════ */}
      <section id="comment-ca-marche" style={{ maxWidth: "1000px", margin: "0 auto clamp(64px, 10vw, 120px)", padding: "0 24px" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: "56px" }}>
            <span className="eyebrow" style={{ justifyContent: "center" }}>Fonctionnement</span>
            <h2 className="display-2" style={{ color: "var(--color-nuit)", margin: "14px 0 0" }}>Comment ça marche</h2>
          </div>
        </Reveal>
        <div style={{ position: "relative" }}>
          <svg viewBox="0 0 1000 20" style={{ width: "100%", height: "20px", position: "absolute", top: "32px", left: 0 }} preserveAspectRatio="none">
            <line x1="100" y1="10" x2="900" y2="10" stroke="var(--color-menthe)" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <div style={{ display: "flex", gap: "24px", justifyContent: "space-between", position: "relative", zIndex: 2, flexWrap: "wrap" }}>
            {ETAPES.map(({ num, titre, desc }, i) => (
              <Reveal key={num} delayMs={i * 90}>
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

      {/* ═══════════════════════ Mission ═══════════════════════ */}
      <section style={{ maxWidth: "1000px", margin: "0 auto clamp(64px, 10vw, 120px)", padding: "0 24px" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <span className="eyebrow" style={{ justifyContent: "center" }}>Pourquoi AKAL</span>
            <h2 className="display-2" style={{ color: "var(--color-nuit)", margin: "14px 0 16px" }}>
              Une terre n&apos;est pas une simple annonce.
            </h2>
            <p className="lede" style={{ maxWidth: "560px", margin: "0 auto" }}>
              C&apos;est un lieu, un projet, une histoire. AKAL rassemble les terres agricoles du Maroc
              dans un espace plus clair, plus direct et plus transparent.
            </p>
          </div>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "32px" }}>
          {RAISONS.map(({ icone: Icone, titre, desc }, i) => (
            <Reveal key={titre} delayMs={i * 80}>
              <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                <span style={{ width: "44px", height: "44px", borderRadius: "50%", backgroundColor: "var(--color-rosee)", color: "var(--color-foret)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icone size={19} strokeWidth={1.75} />
                </span>
                <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-nuit)" }}>{titre}</div>
                <div style={{ fontSize: "14px", color: "var(--color-secondaire)", lineHeight: 1.5 }}>{desc}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════════════════════ Preuves — terres à découvrir ═══════════════════════ */}
      <section style={{ padding: "0 24px", maxWidth: "1100px", margin: "0 auto clamp(64px, 10vw, 120px)" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <span className="eyebrow" style={{ justifyContent: "center" }}>Sélection du catalogue</span>
            <h2 className="display-2" style={{ color: "var(--color-nuit)", margin: "14px 0 0" }}>Des terres à découvrir</h2>
          </div>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "24px" }}>
          {vedettes.map((p, i) => (
            <div key={p.id} className="akal-card-cascade" style={{ animationDelay: `${i * 60}ms` }}>
              {/* vedettes = PARCELLES (mock figé, cf. data/parcelles.ts), pas
                  de vraie Annonce en base — comparateur et favori restent
                  décoratifs ici pour la même raison (aucun id réel à
                  persister), comme sur le reste de cette page. */}
              <CardParcelle
                parcelle={p}
                enComparaison={false}
                onToggleComparaison={() => {}}
                favori={false}
                onToggleFavori={() => {}}
              />
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: "32px" }}>
          <Link href="/parcelles" className="akal-link-fleche">
            Voir toutes les parcelles →
          </Link>
        </div>
      </section>

      {/* ═══════════════════════ Appel à l'action ═══════════════════════ */}
      <Reveal>
        <section style={{ position: "relative", backgroundColor: "var(--color-rosee)", padding: "clamp(56px, 10vw, 88px) 20px", textAlign: "center", overflow: "hidden" }}>
          <div className="akal-texture-topo" aria-hidden style={{ opacity: 0.35 }} />
          <div style={{ position: "relative" }}>
            <h2 className="display-2" style={{ color: "var(--color-nuit)", margin: "0 0 12px" }}>Vous avez une terre à vendre ?</h2>
            <p className="lede" style={{ maxWidth: "480px", margin: "0 auto 28px" }}>
              Donnez-lui la visibilité qu&apos;elle mérite. Déposez votre annonce et entrez directement
              en contact avec des acheteurs.
            </p>
            <Link href="/publier">
              <button className="btn-primary" style={{ padding: "14px 32px", fontSize: "15px" }}>Déposer une annonce</button>
            </Link>
          </div>
        </section>
      </Reveal>

      <section style={{ position: "relative", backgroundColor: "var(--color-nuit)", padding: "clamp(72px, 12vw, 120px) 20px", textAlign: "center", overflow: "hidden" }}>
        <div className="akal-texture-topo" aria-hidden style={{ opacity: 0.14 }} />
        <span
          aria-hidden
          style={{
            position: "absolute",
            fontSize: "220px",
            fontWeight: 700,
            color: "#fff",
            opacity: 0.04,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          ⴰⴽⴰⵍ
        </span>
        <Reveal style={{ position: "relative" }}>
          <h2 className="display-2" style={{ color: "white", margin: "0 0 12px" }}>Rejoignez AKAL</h2>
          <p className="lede" style={{ color: "var(--color-menthe)", maxWidth: "480px", margin: "0 auto 28px" }}>
            Des terres vérifiées, des échanges directs, partout au Maroc.
          </p>
          <Link href="/parcelles">
            <button className="btn-secondary" style={{ backgroundColor: "transparent", borderColor: "white", color: "white", padding: "14px 32px", fontSize: "15px" }}>
              Explorer les parcelles
            </button>
          </Link>
        </Reveal>
      </section>
    </div>
  );
}

// outline volontairement absent d'ici : un style inline gagnerait toujours
// sur la règle CSS .akal-hero-field:focus-visible (spécificité), ce qui
// aurait rendu ce dernier correctif invisible (revue a11y, Phase 3).
const heroFieldStyle: React.CSSProperties = {
  flex: "1 1 140px",
  padding: "12px 16px",
  borderRadius: "var(--radius-sm)",
  fontSize: "14px",
  border: "none",
  backgroundColor: "var(--color-fond-input)",
  color: "var(--color-texte)",
};
