import Link from "next/link";
import { getParcelles, getRegions } from "@/data/parcelles";
import { Reveal } from "@/components/Reveal";
import CouvertureSection from "@/components/home/CouvertureSection";
import SelectionTerrainsSlider from "@/components/home/SelectionTerrainsSlider";
import HeroRecherche from "@/components/home/HeroRecherche";
import { Search, Shield, Check, Map as MapIcon, MessageSquare } from "@/components/icons/Icons";
import { BanniereDemo } from "@/components/BanniereDemo";

// "Statut foncier affiché" (pas "déclaré... sur chaque annonce") — retour
// utilisateur du 11 sept : le statut foncier n'est renseigné que par les
// annonces AKAL (source interne) ; les annonces importées de sources
// externes (Avito, Mubawab) ne le documentent pas (cf. backend
// annonces/management/commands/import_scraped_data.py, champ laissé vide
// faute de donnée fiable dans l'export d'origine) — le libellé précédent
// ("sur chaque annonce") était donc inexact dès qu'une source externe est
// visible (cf. AKAL_DATASET).
const CONFIANCE = [
  { icone: Shield, titre: "Statut foncier affiché", desc: "Melkia, Soulaliya, Guich, Habous, Immatriculé — affiché dès qu'il est renseigné par le vendeur." },
  { icone: Check, titre: "Sans intermédiaire", desc: "Un espace de mise en relation directe entre propriétaires et acheteurs." },
  { icone: MapIcon, titre: "Couverture nationale", desc: "Des parcelles à travers les régions agricoles du Maroc." },
];

const RAISONS = [
  { icone: Search, titre: "Une vision claire", desc: "Toutes les informations essentielles réunies au même endroit." },
  { icone: Shield, titre: "Plus de transparence", desc: "Comprenez le statut et les caractéristiques d'une parcelle avant d'aller plus loin." },
  { icone: MessageSquare, titre: "Des échanges directs", desc: "Un espace pour mettre en relation propriétaires et acheteurs, sans intermédiaire." },
];

// Rendu à la demande, jamais pré-généré. Cette page lit le catalogue via
// l'API au moment du rendu ; au build (Docker / Render) le backend n'est pas
// joignable. Sans ça, Next tenterait un prerender, capterait la version
// dégradée (catalogue vide, cf. try/catch ci-dessous) et la figerait en HTML
// statique servie ensuite en permanence. `force-dynamic` = même choix que
// app/parcelles/[slug]/page.tsx.
export const dynamic = "force-dynamic";

export default async function Home() {
  // Même appel que le catalogue (/parcelles) — page_size au max autorisé par
  // le contrat (§4.2), aucun flux de données spécifique à la Home. `count`
  // est le vrai total serveur (peut dépasser 50), jamais recalculé côté
  // client. `ordering: "-date_publication"` (finalisation §3) — déjà garanti
  // par Meta.ordering côté modèle (annonces/models.py, audit du 2026-07-30)
  // même sans ce paramètre, mais explicite ici pour la même raison de clarté
  // que app/carte/page.tsx : cet échantillon alimente à la fois
  // SelectionTerrainsSlider ("dernières annonces") et CouvertureSection.
  // `getRegions()` (référentiel des 12 régions officielles, même source que
  // FiltresSidebar/CouvertureSection) alimente le <select> du formulaire de
  // recherche du Hero ci-dessous.
  //
  // API injoignable (cold start du backend en offre gratuite, redéploiement,
  // panne) → on dégrade : la page d'accueil reste une vitrine (hero, valeur,
  // CTA) qui a du sens sans catalogue. Les composants en aval gèrent déjà le
  // vide (SelectionTerrainsSlider retourne null, CouvertureSection affiche 0).
  // Le catalogue lui-même (/parcelles, /carte — composants client) affiche,
  // lui, une vraie erreur : c'est là que l'utilisateur attend des données.
  let parcelles: Awaited<ReturnType<typeof getParcelles>>["results"] = [];
  let totalCount = 0;
  let regions: Awaited<ReturnType<typeof getRegions>> = [];
  try {
    const [page, regionsResult] = await Promise.all([
      getParcelles({ page_size: 50, ordering: "-date_publication" }),
      getRegions(),
    ]);
    parcelles = page.results;
    totalCount = page.count;
    regions = regionsResult;
  } catch (err) {
    console.error("[home] catalogue injoignable, rendu dégradé :", err);
  }

  return (
    <div>
      {/* ═══════════════════════ Hero — Recherche ═══════════════════════ */}
      {/* Refonte du 11/09 (handoff design, écran validé 2a) : la recherche
          devient l'objet principal du hero plutôt qu'un simple champ dans
          le décor — trois modes (région / autour de moi / carte), surface
          et budget, mêmes filtres réels que FiltresSidebar.tsx (rien de
          nouveau côté API). Composant client isolé (HeroRecherche) : seule
          la interaction (bascule de mode, géolocalisation) a besoin du
          navigateur, le reste de la page (catalogue, régions) reste rendu
          serveur comme avant. */}
      <HeroRecherche regions={regions} />

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

      {/* Bandeau "données de démonstration" — cohérence avec le catalogue et
          la fiche (cf. config/features.ts::BANNIERE_DEMO), les sections
          "Couverture" et "Sélection de terrains" ci-dessous affichant les
          mêmes annonces d'exemple. */}
      <div style={{ maxWidth: "1160px", margin: "0 auto", padding: "0 20px 8px" }}>
        <BanniereDemo />
      </div>

      {/* ═══════════════════════ Valeur — couverture ═══════════════════════ */}
      <CouvertureSection parcelles={parcelles} totalCount={totalCount} />

      {/* ═══════════════════════ Preuves — slider "Sélection de terrains" (P1-05) ═══════════════════════ */}
      {/* Remplace l'ancienne grille statique à 3 cartes : mêmes vraies
          annonces que le catalogue (getParcelles(), cf. Home ci-dessus),
          mais en piste défilante pour montrer plus de terrains sans
          allonger la page. Favori/comparateur restent décoratifs ici
          volontairement : la Home est une vitrine de découverte, pas le
          catalogue interactif (useFavorisIds()/état comparateur vivent
          dans /parcelles). Placé avant "Pourquoi AKAL" (retour utilisateur,
          11 sept) : montrer les terrains réels convainc plus vite que
          l'argumentaire, qui vient ensuite l'étayer. */}
      <Reveal>
        <SelectionTerrainsSlider parcelles={parcelles.slice(0, 9)} />
      </Reveal>

      {/* ═══════════════════════ Mission ═══════════════════════ */}
      {/* "Fonctionnement / Comment ça marche" retiré d'ici le 2026-08-17 —
          doublon avec sa page dédiée (/comment-ca-marche,
          CommentCaMarcheSection.tsx), désormais le seul endroit où ce
          contenu vit. Toujours atteignable depuis le Hero et le footer. */}
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
            Des terres déclarées en toute transparence, des échanges directs, partout au Maroc.
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
