import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { Shield, MessageSquare, MapPin as MapIcon, Ruler } from "@/components/icons/Icons";

export const metadata: Metadata = {
  title: "Notre mission • AKAL",
  description: "Pourquoi AKAL existe et ce que la plateforme change pour l'achat et la vente de terres agricoles au Maroc.",
};

const PILIERS = [
  {
    icone: Shield,
    titre: "Clarté sur le statut foncier",
    desc: "Chaque annonce indique le statut déclaré par le vendeur (melkia, soulaliya, guich, habous, immatriculé) — pour comprendre ce que vous regardez avant d'aller plus loin.",
  },
  {
    icone: MapIcon,
    titre: "Une vision géographique complète",
    desc: "Une carte du Maroc, région par région, pour situer une parcelle dans son territoire plutôt que la découvrir comme une simple fiche isolée.",
  },
  {
    icone: MessageSquare,
    titre: "Mise en relation directe",
    desc: "AKAL connecte propriétaires et acheteurs sans jouer les intermédiaires juridiques ou commerciaux — la discussion et la décision restent entre vous.",
  },
  {
    icone: Ruler,
    titre: "Des critères qui comptent vraiment",
    desc: "Surface, prix, accès à l'eau, topographie : les informations utiles pour juger du potentiel d'une terre agricole, présentées de façon lisible.",
  },
];

const CE_QUE_AKAL_NEST_PAS = [
  "Un intermédiaire juridique ou commercial dans la transaction",
  "Un organisme de vérification officielle du statut foncier",
  "Un simulateur ou un conseiller financier",
];

// Page dédiée (P1-04, "proposition de valeur") — le contenu "Pourquoi AKAL"
// existant sur la home (section RAISONS, app/page.tsx) reste en place là-bas
// comme teaser rapide (3 icônes) ; cette page va plus loin et assume aussi
// ce qu'AKAL n'est pas encore (juridique, back-office, modération —
// cf. registre P2-02/P2-03 du PDF de répartition), pour ne jamais laisser
// croire à une promesse de vérification.
export default function PropositionDeValeurPage() {
  return (
    <div>
      <section style={{ maxWidth: "760px", margin: "0 auto", padding: "clamp(48px, 8vw, 80px) 24px 0", textAlign: "center" }}>
        <Reveal>
          <span className="eyebrow" style={{ justifyContent: "center" }}>Notre mission</span>
          <h1 className="display-1" style={{ color: "var(--color-nuit)", margin: "18px 0 16px" }}>
            La terre agricole, sans zones d&apos;ombre.
          </h1>
          <p className="lede" style={{ maxWidth: "560px", margin: "0 auto" }}>
            AKAL rassemble les terres agricoles du Maroc dans un espace plus clair, plus direct et plus
            transparent — pour que chercher, comparer et entrer en contact ne soit plus un parcours du
            combattant.
          </p>
        </Reveal>
      </section>

      <section style={{ maxWidth: "1000px", margin: "clamp(48px, 8vw, 80px) auto", padding: "0 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "32px" }}>
          {PILIERS.map(({ icone: Icone, titre, desc }, i) => (
            <Reveal key={titre} delayMs={i * 80}>
              <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0, width: "44px", height: "44px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--color-rosee)", color: "var(--color-foret)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-1)" }}>
                  <Icone size={20} strokeWidth={1.75} />
                </span>
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-nuit)", marginBottom: "6px" }}>{titre}</div>
                  <div style={{ fontSize: "14px", color: "var(--color-secondaire)", lineHeight: 1.6 }}>{desc}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: "700px", margin: "0 auto clamp(64px, 10vw, 120px)", padding: "0 24px" }}>
        <Reveal>
          <div style={{ padding: "32px", border: "1px solid var(--color-bordure)", borderRadius: "var(--radius-lg)", backgroundColor: "white" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-nuit)", marginBottom: "16px" }}>
              Ce qu&apos;AKAL n&apos;est pas
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "12px" }}>
              {CE_QUE_AKAL_NEST_PAS.map((point) => (
                <li key={point} style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "14px", color: "var(--color-secondaire)", lineHeight: 1.5 }}>
                  <span aria-hidden style={{ color: "var(--color-terre-texte)", flexShrink: 0 }}>—</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      <Reveal>
        <section style={{ position: "relative", backgroundColor: "var(--color-rosee)", padding: "clamp(56px, 10vw, 88px) 20px", textAlign: "center", overflow: "hidden" }}>
          <div className="akal-texture-topo" aria-hidden style={{ opacity: 0.35 }} />
          <div style={{ position: "relative" }}>
            <h2 className="display-2" style={{ color: "var(--color-nuit)", margin: "0 0 12px" }}>Voir comment ça marche</h2>
            <p className="lede" style={{ maxWidth: "480px", margin: "0 auto 28px" }}>
              Le parcours acheteur et le parcours vendeur, étape par étape.
            </p>
            <Link href="/comment-ca-marche">
              <button className="btn-primary" style={{ padding: "14px 32px", fontSize: "15px" }}>Découvrir le fonctionnement</button>
            </Link>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
