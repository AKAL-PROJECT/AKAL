import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import CommentCaMarcheSection from "@/components/home/CommentCaMarcheSection";
import { STATUT_FONCIER_LABEL } from "@/components/parcelles/BadgeStatut";

export const metadata: Metadata = {
  title: "Comment ça marche • AKAL",
  description: "Le parcours acheteur et le parcours vendeur sur AKAL, étape par étape.",
};

// Réutilise littéralement STATUT_FONCIER_LABEL (BadgeStatut.tsx, déjà la
// source de vérité affichée en tooltip sur chaque badge de statut) plutôt
// que de réécrire une définition parallèle qui pourrait diverger. Melkia +
// Immatriculé seulement (les deux statuts les plus fréquents/les plus
// demandés, cf. calque 1f du handoff design) — pas les 5, pour ne pas
// diluer la réponse.
const FAQ = [
  {
    q: `Que signifie « ${STATUT_FONCIER_LABEL.melkia.label} » ou « ${STATUT_FONCIER_LABEL.immatricule.label} » ?`,
    r: `${STATUT_FONCIER_LABEL.immatricule.label} : ${STATUT_FONCIER_LABEL.immatricule.description} ${STATUT_FONCIER_LABEL.melkia.label} : ${STATUT_FONCIER_LABEL.melkia.description}`,
  },
  {
    q: "AKAL vérifie-t-il les titres ?",
    r: "Non. Le statut foncier déclaré par le vendeur est affiché sur chaque annonce, mais il reste déclaratif — nous ne le vérifions pas. La vérification d'un titre revient à un professionnel du foncier (notaire, avocat).",
  },
  {
    q: "Pourquoi l'emplacement est-il approximatif ?",
    r: "La position exacte d'une parcelle n'est jamais affichée publiquement — seule une zone approximative l'est, pour protéger la confidentialité du vendeur. L'emplacement précis se communique lors du contact.",
  },
  {
    q: "Combien coûte la mise en relation ?",
    r: "Rien sur la transaction. Vous écrivez directement au vendeur ou à l'acheteur et poursuivez l'échange hors plateforme si vous le souhaitez — AKAL ne prend aucune commission.",
  },
];

// Page dédiée (P1-04) — le contenu détaillé vit ici, plus du tout sur la
// homepage : son ancien teaser léger (CommentCaMarcheTeaser.tsx) a été
// retiré le 2026-08-17, la home ne garde plus qu'un lien direct vers cette
// page (Hero + footer). Le composant à onglets lui-même
// (CommentCaMarcheSection) est réutilisé tel quel : même logique, juste un
// seul emplacement désormais — aucune duplication de code.
//
// Calque 1f du handoff design (11 sept) : CommentCaMarcheSection est passé
// d'une bascule à onglets à deux parcours côte à côte, chacun avec son
// propre CTA — l'ancien bandeau CTA générique de cette page (Explorer les
// parcelles / Déposer une annonce) devenait un doublon, remplacé par la
// FAQ foncière + son propre bandeau disclaimer ci-dessous.
export default function CommentCaMarchePage() {
  return (
    <div>
      <section style={{ maxWidth: "760px", margin: "0 auto", padding: "clamp(48px, 8vw, 80px) 24px 0", textAlign: "center" }}>
        <Reveal>
          <span className="eyebrow" style={{ justifyContent: "center" }}>Fonctionnement</span>
          <h1 className="display-1" style={{ color: "var(--color-nuit)", margin: "18px 0 16px" }}>
            Un espace direct, sans intermédiaire.
          </h1>
          <p className="lede" style={{ maxWidth: "560px", margin: "0 auto" }}>
            Que vous cherchiez une terre agricole ou que vous souhaitiez vendre la vôtre, AKAL vous met
            en relation directement — voici comment ça se passe, étape par étape.
          </p>
        </Reveal>
      </section>

      <CommentCaMarcheSection />

      <section style={{ maxWidth: "1000px", margin: "0 auto clamp(64px, 10vw, 96px)", padding: "0 24px" }}>
        <Reveal>
          <h2 className="display-2" style={{ color: "var(--color-nuit)", margin: "0 0 24px" }}>
            Les questions foncières qu&apos;on nous pose
          </h2>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px" }}>
          {FAQ.map(({ q, r }, i) => (
            <Reveal key={q} delayMs={i * 60}>
              <div style={{ backgroundColor: "var(--color-fond)", border: "1px solid var(--color-bordure)", borderRadius: "var(--radius-md)", padding: "20px 22px", height: "100%", boxSizing: "border-box" }}>
                <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-nuit)" }}>{q}</div>
                <p style={{ margin: "10px 0 0", fontSize: "13.5px", lineHeight: 1.7, color: "var(--color-secondaire)" }}>{r}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delayMs={FAQ.length * 60}>
          <div style={{ marginTop: "22px", backgroundColor: "var(--color-rosee)", borderRadius: "var(--radius-md)", padding: "18px 24px", display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap" }}>
            <p style={{ flex: 1, minWidth: "260px", margin: 0, fontSize: "14px", lineHeight: 1.65, color: "var(--color-nuit)" }}>
              AKAL n&apos;est ni notaire, ni agence, ni expert foncier. Faites toujours vérifier un titre par un professionnel avant de signer.
            </p>
            <Link href="/carte" style={{ textDecoration: "none" }}>
              <button className="btn-primary" style={{ padding: "12px 24px", fontSize: "14px", whiteSpace: "nowrap" }}>
                Explorer la carte
              </button>
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
