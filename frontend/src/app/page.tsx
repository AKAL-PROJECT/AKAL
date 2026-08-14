import Link from "next/link";
import Image from "next/image";
import { getParcelles } from "@/data/parcelles";
import CardParcelle from "@/components/parcelles/CardParcelle";
import { Reveal } from "@/components/Reveal";
import CouvertureSection from "@/components/home/CouvertureSection";
import CommentCaMarcheSection from "@/components/home/CommentCaMarcheSection";
import { Search, Shield, Check, Map as MapIcon, MessageSquare, ArrowRight } from "@/components/icons/Icons";

// cf. REGIONS_MOCK dans data/parcelles.ts — mêmes codes/libellés. Sert
// uniquement au <select> du formulaire de recherche du Hero ci-dessous
// (aucune interactivité region→carte ici, cf. CouvertureSection pour ça).
const REGIONS = [
  { code: "casablanca-settat", nom: "Casablanca-Settat" },
  { code: "fes-meknes", nom: "Fès-Meknès" },
  { code: "souss-massa", nom: "Souss-Massa" },
  { code: "rabat-sale-kenitra", nom: "Rabat-Salé-Kénitra" },
  { code: "oriental", nom: "Oriental" },
];

const CONFIANCE = [
  { icone: Shield, titre: "Statut foncier vérifié", desc: "Melkia, Soulaliya, Guich, Habous, Immatriculé — clairement identifié sur chaque annonce." },
  { icone: Check, titre: "Sans intermédiaire", desc: "Un espace de mise en relation directe entre propriétaires et acheteurs." },
  { icone: MapIcon, titre: "Couverture nationale", desc: "Des parcelles à travers les régions agricoles du Maroc." },
];

const RAISONS = [
  { icone: Search, titre: "Une vision claire", desc: "Toutes les informations essentielles réunies au même endroit." },
  { icone: Shield, titre: "Plus de transparence", desc: "Comprenez le statut et les caractéristiques d'une parcelle avant d'aller plus loin." },
  { icone: MessageSquare, titre: "Des échanges directs", desc: "Un espace pour mettre en relation propriétaires et acheteurs, sans intermédiaire." },
];

export default async function Home() {
  // Même appel que le catalogue (/parcelles) et generateStaticParams
  // (app/parcelles/[slug]/page.tsx) — page_size au max autorisé par le
  // contrat (§4.2), aucun flux de données spécifique à la Home. `count` est
  // le vrai total serveur (peut dépasser 50), jamais recalculé côté client.
  const { results: parcelles, count: totalCount } = await getParcelles({ page_size: 50 });
  const vedettes = parcelles.slice(0, 3);

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
      <CouvertureSection parcelles={parcelles} totalCount={totalCount} />

      {/* ═══════════════════════ Fonctionnalités ═══════════════════════ */}
      <CommentCaMarcheSection />

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
              {/* vedettes = mêmes vraies annonces que le catalogue (getParcelles(),
                  cf. Home ci-dessus) — favori/comparateur restent décoratifs
                  ici volontairement : la Home est une vitrine de découverte,
                  pas le catalogue interactif (useFavorisIds()/état comparateur
                  vivent dans /parcelles, cf. "Voir toutes les parcelles" plus
                  bas pour l'expérience complète). */}
              <CardParcelle parcelle={p} enComparaison={false} favori={false} />
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
