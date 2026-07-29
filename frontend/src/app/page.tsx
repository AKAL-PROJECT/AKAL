"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PARCELLES } from "@/data/parcelles";
import CardParcelle from "@/components/parcelles/CardParcelle";
import { Search } from "@/components/icons/Icons";

// cf. REGIONS_MOCK dans data/parcelles.ts — mêmes codes/libellés.
const REGIONS = [
  { code: "casablanca-settat", nom: "Casablanca-Settat" },
  { code: "meknes-tafilalet", nom: "Meknès-Tafilalet" },
  { code: "souss-massa", nom: "Souss-Massa" },
  { code: "rabat-sale-kenitra", nom: "Rabat-Salé-Kénitra" },
  { code: "oriental", nom: "Oriental" },
];

const ETAPES = [
  {
    num: "01",
    titre: "Explorez",
    desc: "Parcourez des parcelles vérifiées partout au Maroc. Filtrez par région et budget.",
  },
  {
    num: "02",
    titre: "Comparez",
    desc: "Statut foncier, accès à l'eau, AgriScore — comparez les parcelles côte à côte.",
  },
  {
    num: "03",
    titre: "Contactez",
    desc: "Échangez directement avec le vendeur, sans intermédiaire.",
  },
];

const RAISONS = [
  {
    titre: "Une vision claire",
    desc: "Toutes les informations essentielles réunies au même endroit.",
  },
  {
    titre: "Plus de transparence",
    desc: "Comprenez le statut et les caractéristiques d'une parcelle avant d'aller plus loin.",
  },
  {
    titre: "Des échanges directs",
    desc: "Un espace pour mettre en relation propriétaires et acheteurs, sans intermédiaire.",
  },
];

const TEMOIGNAGES = [
  {
    texte: "AKAL m'a permis de trouver une oliveraie à Fès en deux semaines, avec un passeport foncier clair dès la première visite.",
    nom: "Rachid Bennani",
    role: "Acheteur, Fès",
  },
  {
    texte: "J'ai vendu ma parcelle de Meknès sans intermédiaire, en échangeant directement avec l'acheteur.",
    nom: "Khadija Tazi",
    role: "Vendeuse, Meknès",
  },
  {
    texte: "Le comparateur m'a évité une erreur : deux parcelles semblaient identiques, l'AgriScore a tout changé.",
    nom: "Youssef Idrissi",
    role: "Acheteur, Agadir",
  },
];

function useCompteurAnime(cible: number, actif: boolean) {
  const [valeur, setValeur] = useState(0);
  useEffect(() => {
    if (!actif) return;
    const debut = performance.now();
    const duree = 1200;
    let frame: number;
    const tick = (maintenant: number) => {
      const t = Math.min(1, (maintenant - debut) / duree);
      const easedT = 1 - Math.pow(1 - t, 3);
      setValeur(Math.round(cible * easedT));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [actif, cible]);
  return valeur;
}

function StatsAnimees() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const parcelles = useCompteurAnime(142, visible);
  const regions = useCompteurAnime(8, visible);
  const cultures = useCompteurAnime(12, visible);

  return (
    <div ref={ref} style={{ display: "flex", justifyContent: "center", gap: "80px", flexWrap: "wrap" }}>
      {([[parcelles, "parcelles"], [regions, "régions"], [cultures, "cultures"]] as const).map(([n, l]) => (
        <div key={l} style={{ textAlign: "center" }}>
          <div style={{ fontSize: "44px", fontWeight: 500, color: "var(--color-foret)", fontVariantNumeric: "tabular-nums" }}>{n}</div>
          <div style={{ fontSize: "14px", color: "var(--color-secondaire)", marginTop: "4px" }}>{l}</div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const vedettes = PARCELLES.slice(0, 3);

  return (
    <div>
      {/* ───── Hero ───── */}
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          minHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "56px 24px",
        }}
      >
        <div
          className="akal-sunrise-bg"
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(120deg, #1B3A2D, #2D6A4F, #52B788, #2D6A4F, #1B3A2D)",
            backgroundSize: "300% 300%",
            animation: "akal-sunrise 12s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to bottom, rgba(15,35,26,0.75) 0%, rgba(20,45,33,0.35) 38%, rgba(20,45,33,0.15) 60%, rgba(10,25,18,0.65) 100%)",
          }}
        />
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.06, pointerEvents: "none" }} preserveAspectRatio="none">
          <line x1="0" y1="20%" x2="100%" y2="14%" stroke="#fff" strokeWidth={1} />
          <line x1="0" y1="42%" x2="100%" y2="38%" stroke="#fff" strokeWidth={1} />
          <line x1="0" y1="64%" x2="100%" y2="70%" stroke="#fff" strokeWidth={1} />
          <line x1="0" y1="86%" x2="100%" y2="92%" stroke="#fff" strokeWidth={1} />
          <line x1="18%" y1="0" x2="12%" y2="100%" stroke="#fff" strokeWidth={1} />
          <line x1="52%" y1="0" x2="58%" y2="100%" stroke="#fff" strokeWidth={1} />
          <line x1="84%" y1="0" x2="80%" y2="100%" stroke="#fff" strokeWidth={1} />
        </svg>
        <span
          aria-hidden
          style={{
            position: "absolute",
            fontSize: "340px",
            fontWeight: 700,
            color: "#fff",
            opacity: 0.04,
            pointerEvents: "none",
            userSelect: "none",
            whiteSpace: "nowrap",
          }}
        >
          ⴰⴽⴰⵍ
        </span>

        <div style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <h1
            className="akal-push-up"
            style={{ fontSize: "clamp(30px, 7vw, 56px)", fontWeight: 500, letterSpacing: "-1px", color: "white", margin: "0 0 8px", animationDelay: "0ms" }}
          >
            Des terres agricoles.
          </h1>
          <h1
            className="akal-push-up"
            style={{ fontSize: "clamp(30px, 7vw, 56px)", fontWeight: 500, letterSpacing: "-1px", color: "white", margin: "0 0 28px", animationDelay: "160ms" }}
          >
            Des projets à faire grandir.
          </h1>
          <p
            className="akal-push-up"
            style={{ fontSize: "17px", color: "var(--color-menthe)", maxWidth: "480px", margin: "0 auto 28px", animationDelay: "240ms" }}
          >
            Découvrez des parcelles vérifiées partout au Maroc. Explorez. Comparez. Contactez directement.
          </p>

          <form
            action="/parcelles"
            method="GET"
            className="akal-push-up"
            style={{
              backgroundColor: "white",
              borderRadius: "24px",
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
              padding: "8px",
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              maxWidth: "520px",
              margin: "0 auto",
              animationDelay: "320ms",
            }}
          >
            <select name="region" style={heroFieldStyle} defaultValue="">
              <option value="">Région</option>
              {REGIONS.map((r) => (
                <option key={r.code} value={r.code}>{r.nom}</option>
              ))}
            </select>
            <input name="prix_max" type="number" placeholder="Budget max (MAD)" style={heroFieldStyle} />
            <button
              type="submit"
              className="btn-primary"
              style={{ flex: "0 0 auto", width: "48px", height: "48px", borderRadius: "24px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
              aria-label="Rechercher"
            >
              <Search size={18} />
            </button>
          </form>

          <Link
            href="#comment-ca-marche"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--color-menthe)", fontSize: "14px", marginTop: "20px", borderBottom: "1px solid rgba(234,244,238,0.4)", textDecoration: "none" }}
          >
            Comment ça marche →
          </Link>

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "14px 20px", marginTop: "24px", maxWidth: "480px" }}>
            {["Statut foncier vérifié", "Sans intermédiaire", "Couverture nationale"].map((t) => (
              <span key={t} style={{ fontSize: "13px", color: "var(--color-menthe)", display: "flex", alignItems: "center", gap: "6px" }}>
                <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="var(--color-menthe)" strokeWidth={1.8}>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="akal-bounce" style={{ position: "absolute", bottom: "28px", left: "50%", transform: "translateX(-50%)", zIndex: 2 }}>
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="var(--color-menthe)" strokeWidth={1.8}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </section>

      {/* ───── Parcelles à découvrir ───── */}
      <section style={{ padding: "80px 24px 0", maxWidth: "1100px", margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: "28px", fontWeight: 500, letterSpacing: "-0.5px", margin: "0 0 40px" }}>
          Des terres à découvrir
        </h2>
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
          <Link href="/parcelles" style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-foret)", borderBottom: "1px solid var(--color-foret)", paddingBottom: "2px", textDecoration: "none" }}>
            Voir toutes les parcelles →
          </Link>
        </div>
      </section>

      {/* ───── Stats ───── */}
      <div style={{ padding: "80px 20px" }}>
        <StatsAnimees />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "16px", maxWidth: "720px", margin: "0 auto 60px", padding: "0 20px" }}>
        <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-bordure)" }} />
        <span style={{ color: "var(--color-prairie)", fontSize: "14px" }}>▲</span>
        <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-bordure)" }} />
      </div>

      {/* ───── Carte du Maroc ───── */}
      <section style={{ maxWidth: "1100px", margin: "0 auto 100px", padding: "0 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "48px", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "28px", fontWeight: 500, letterSpacing: "-0.5px", margin: "0 0 16px" }}>La terre n&apos;est jamais loin.</h2>
          <p style={{ fontSize: "15px", color: "var(--color-secondaire)", lineHeight: 1.6, margin: "0 0 24px" }}>
            Explorez les terres disponibles à travers le Maroc, région par région.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "28px" }}>
            {REGIONS.map((r) => (
              <Link
                key={r.code}
                href={`/parcelles?region=${r.code}`}
                style={{ fontSize: "13px", color: "var(--color-texte)", backgroundColor: "white", border: "1px solid var(--color-bordure)", borderRadius: "16px", padding: "8px 16px", textDecoration: "none" }}
              >
                {r.nom}
              </Link>
            ))}
          </div>
          <Link href="/parcelles" style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-foret)", borderBottom: "1px solid var(--color-foret)", paddingBottom: "2px", textDecoration: "none" }}>
            Explorer la carte →
          </Link>
        </div>
        <Link href="/parcelles" style={{ height: "320px", borderRadius: "16px", backgroundColor: "var(--color-rosee)", position: "relative", overflow: "hidden", display: "block" }}>
          <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ opacity: 0.5 }}>
            <path d="M60 20 L140 15 L165 60 L150 120 L120 180 L70 175 L35 130 L25 70 Z" fill="none" stroke="var(--color-foret)" strokeWidth={2} />
          </svg>
          {[[38, 32], [55, 52], [30, 58], [68, 40]].map(([top, left], i) => (
            <span key={i} style={{ position: "absolute", top: `${top}%`, left: `${left}%`, width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "var(--color-terre)" }} />
          ))}
          <span style={{ position: "absolute", bottom: "14px", left: "14px", fontSize: "13px", fontWeight: 500, color: "var(--color-nuit)", backgroundColor: "rgba(255,255,255,0.85)", borderRadius: "8px", padding: "6px 12px" }}>
            {PARCELLES.length} parcelles disponibles
          </span>
        </Link>
      </section>

      {/* ───── Comment ça marche ───── */}
      <section id="comment-ca-marche" style={{ maxWidth: "1000px", margin: "0 auto 100px", padding: "0 20px" }}>
        <h2 style={{ textAlign: "center", fontSize: "32px", fontWeight: 500, letterSpacing: "-0.5px", margin: "0 0 56px" }}>Comment ça marche</h2>
        <div style={{ position: "relative" }}>
          <svg viewBox="0 0 1000 20" style={{ width: "100%", height: "20px", position: "absolute", top: "32px", left: 0 }} preserveAspectRatio="none">
            <line x1="100" y1="10" x2="900" y2="10" stroke="var(--color-menthe)" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <div style={{ display: "flex", gap: "24px", justifyContent: "space-between", position: "relative", zIndex: 2, flexWrap: "wrap" }}>
            {ETAPES.map(({ num, titre, desc }) => (
              <div key={num} style={{ width: "220px", maxWidth: "100%", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", margin: "0 auto" }}>
                <div style={{ width: "64px", height: "64px", borderRadius: "50%", backgroundColor: "var(--color-foret)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: 500 }}>
                  {num}
                </div>
                <div style={{ fontSize: "16px", fontWeight: 500 }}>{titre}</div>
                <div style={{ fontSize: "14px", color: "var(--color-secondaire)", lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── Mission ───── */}
      <section style={{ maxWidth: "1000px", margin: "0 auto 100px", padding: "0 20px" }}>
        <h2 style={{ textAlign: "center", fontSize: "28px", fontWeight: 500, letterSpacing: "-0.5px", margin: "0 0 12px" }}>
          Une terre n&apos;est pas une simple annonce.
        </h2>
        <p style={{ textAlign: "center", fontSize: "15px", color: "var(--color-secondaire)", maxWidth: "560px", margin: "0 auto 12px" }}>
          C&apos;est un lieu, un projet, une histoire. AKAL rassemble les terres agricoles du Maroc dans un espace plus clair, plus direct et plus transparent.
        </p>
        <p style={{ textAlign: "center", fontSize: "13px", fontWeight: 500, color: "var(--color-foret)", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 40px" }}>
          Pourquoi AKAL
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "32px" }}>
          {RAISONS.map((r) => (
            <div key={r.titre} style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
              <div style={{ fontSize: "16px", fontWeight: 500 }}>{r.titre}</div>
              <div style={{ fontSize: "14px", color: "var(--color-secondaire)", lineHeight: 1.5 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ───── Témoignages ───── */}
      <section style={{ padding: "0 20px 100px", maxWidth: "1000px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", maxWidth: "720px", margin: "0 auto 48px" }}>
          <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-bordure)" }} />
          <span style={{ color: "var(--color-prairie)", fontSize: "14px" }}>▲</span>
          <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-bordure)" }} />
        </div>
        <h2 style={{ textAlign: "center", fontSize: "28px", fontWeight: 500, letterSpacing: "-0.5px", margin: "0 0 40px" }}>Ils ont trouvé leur terre</h2>
        <div style={{ display: "flex", gap: "24px", overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: "8px" }}>
          {TEMOIGNAGES.map((t) => (
            <div key={t.nom} className="card" style={{ scrollSnapAlign: "start", flex: "none", width: "320px", padding: "24px" }}>
              <p style={{ fontSize: "15px", color: "var(--color-texte)", lineHeight: 1.6, margin: "0 0 16px" }}>&quot;{t.texte}&quot;</p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "var(--color-menthe)", color: "var(--color-nuit)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 500, flexShrink: 0 }}>
                  {t.nom.charAt(0)}
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 500 }}>{t.nom}</div>
                  <div style={{ fontSize: "12px", color: "var(--color-secondaire)" }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───── CTA vendeur ───── */}
      <section style={{ backgroundColor: "var(--color-rosee)", padding: "80px 20px", textAlign: "center" }}>
        <h2 style={{ fontSize: "28px", fontWeight: 500, letterSpacing: "-0.5px", margin: "0 0 12px" }}>Vous avez une terre à vendre ?</h2>
        <p style={{ fontSize: "15px", color: "var(--color-secondaire)", maxWidth: "480px", margin: "0 auto 28px", lineHeight: 1.6 }}>
          Donnez-lui la visibilité qu&apos;elle mérite. Déposez votre annonce et entrez directement en contact avec des acheteurs.
        </p>
        <Link href="/publier">
          <button className="btn-primary" style={{ padding: "14px 32px", fontSize: "15px" }}>Déposer une annonce</button>
        </Link>
      </section>

      {/* ───── CTA final ───── */}
      <section style={{ position: "relative", backgroundColor: "var(--color-nuit)", padding: "100px 20px", textAlign: "center", overflow: "hidden" }}>
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
        <div style={{ position: "relative", zIndex: 1 }}>
          <h2 style={{ fontSize: "28px", fontWeight: 500, letterSpacing: "-0.5px", color: "white", margin: "0 0 12px" }}>Rejoignez AKAL</h2>
          <p style={{ fontSize: "15px", color: "var(--color-menthe)", maxWidth: "480px", margin: "0 auto 28px", lineHeight: 1.6 }}>
            Des terres vérifiées, des échanges directs, partout au Maroc.
          </p>
          <Link href="/parcelles">
            <button className="btn-secondary" style={{ backgroundColor: "transparent", borderColor: "white", color: "white", padding: "14px 32px", fontSize: "15px" }}>
              Explorer les parcelles
            </button>
          </Link>
        </div>
      </section>
    </div>
  );
}

const heroFieldStyle: React.CSSProperties = {
  flex: "1 1 140px",
  padding: "12px 16px",
  borderRadius: "16px",
  fontSize: "14px",
  border: "none",
  outline: "none",
  backgroundColor: "var(--color-rosee)",
  color: "var(--color-texte)",
};
