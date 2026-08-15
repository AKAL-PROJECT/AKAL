import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { FileText, Ruler, MessageSquare } from "@/components/icons/Icons";

export const metadata: Metadata = {
  title: "Financement • AKAL",
  description: "Ce qu'il faut savoir sur le financement d'une terre agricole au Maroc — page d'information, sans simulateur.",
};

const POINTS = [
  {
    icone: FileText,
    titre: "Le statut foncier compte",
    desc: "Le mode de financement accessible dépend souvent du statut de la parcelle (melkia, soulaliya, guich, habous, immatriculé) — un point à clarifier tôt avec votre banque ou votre conseiller.",
  },
  {
    icone: Ruler,
    titre: "Le prix affiché n'inclut pas les frais annexes",
    desc: "Frais de notaire, d'enregistrement, d'immatriculation le cas échéant : à anticiper en plus du prix de la parcelle indiqué sur l'annonce.",
  },
  {
    icone: MessageSquare,
    titre: "Chaque situation est différente",
    desc: "AKAL ne connaît ni votre profil ni les conditions proposées par les établissements financiers — un conseiller bancaire ou un notaire reste le bon interlocuteur pour évaluer votre dossier.",
  },
];

// Page d'information uniquement (P1-08) — AUCUN simulateur de crédit, ni
// calcul de mensualités, ni estimation chiffrée : le PDF de répartition
// est explicite là-dessus (critère de validation "Page info, zéro
// simulateur"). Cette page reste donc volontairement générale et renvoie
// vers des professionnels pour tout calcul personnalisé.
export default function FinancementPage() {
  return (
    <div>
      <section style={{ maxWidth: "760px", margin: "0 auto", padding: "clamp(48px, 8vw, 80px) 24px 0", textAlign: "center" }}>
        <Reveal>
          <span className="eyebrow" style={{ justifyContent: "center" }}>Financement</span>
          <h1 className="display-1" style={{ color: "var(--color-nuit)", margin: "18px 0 16px" }}>
            Ce qu&apos;il faut savoir avant de financer votre achat.
          </h1>
          <p className="lede" style={{ maxWidth: "560px", margin: "0 auto" }}>
            AKAL ne propose pas de simulation de crédit ni de conseil financier personnalisé — voici
            simplement quelques repères généraux pour aborder le sujet avec les bons interlocuteurs.
          </p>
        </Reveal>
      </section>

      <section style={{ maxWidth: "760px", margin: "clamp(48px, 8vw, 80px) auto", padding: "0 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          {POINTS.map(({ icone: Icone, titre, desc }, i) => (
            <Reveal key={titre} delayMs={i * 80}>
              <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", padding: "24px", border: "1px solid var(--color-bordure)", borderRadius: "var(--radius-lg)", backgroundColor: "white" }}>
                <span style={{ flexShrink: 0, width: "40px", height: "40px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--color-rosee)", color: "var(--color-foret)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icone size={18} strokeWidth={1.75} />
                </span>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-nuit)", marginBottom: "6px" }}>{titre}</div>
                  <div style={{ fontSize: "14px", color: "var(--color-secondaire)", lineHeight: 1.6 }}>{desc}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: "700px", margin: "0 auto clamp(64px, 10vw, 120px)", padding: "0 24px" }}>
        <Reveal>
          <div
            style={{
              padding: "20px 24px",
              borderRadius: "var(--radius-lg)",
              backgroundColor: "var(--color-parchemin)",
              border: "1px solid var(--color-sable)",
              fontSize: "14px",
              color: "var(--color-texte)",
              lineHeight: 1.6,
            }}
          >
            Cette page est informative et générale. Elle ne constitue ni un conseil financier, ni une
            estimation de mensualités, ni un engagement d&apos;AKAL. Pour un calcul adapté à votre
            situation, rapprochez-vous d&apos;un établissement bancaire ou d&apos;un notaire.
          </div>
        </Reveal>
      </section>

      <Reveal>
        <section style={{ position: "relative", backgroundColor: "var(--color-rosee)", padding: "clamp(56px, 10vw, 88px) 20px", textAlign: "center", overflow: "hidden" }}>
          <div className="akal-texture-topo" aria-hidden style={{ opacity: 0.35 }} />
          <div style={{ position: "relative" }}>
            <h2 className="display-2" style={{ color: "var(--color-nuit)", margin: "0 0 12px" }}>Prêt à explorer ?</h2>
            <p className="lede" style={{ maxWidth: "480px", margin: "0 auto 28px" }}>
              Parcourez les terres disponibles et affinez par région et budget.
            </p>
            <Link href="/parcelles">
              <button className="btn-primary" style={{ padding: "14px 32px", fontSize: "15px" }}>Explorer les parcelles</button>
            </Link>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
