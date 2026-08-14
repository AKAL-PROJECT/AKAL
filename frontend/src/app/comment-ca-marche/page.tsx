import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import CommentCaMarcheSection from "@/components/home/CommentCaMarcheSection";

export const metadata: Metadata = {
  title: "Comment ça marche • AKAL",
  description: "Le parcours acheteur et le parcours vendeur sur AKAL, étape par étape.",
};

// Page dédiée (P1-04) — le contenu détaillé vit ici plutôt que dans la
// homepage, qui ne garde qu'un teaser léger + lien vers cette page
// (CommentCaMarcheTeaser.tsx, cf. app/page.tsx). Le composant à onglets
// lui-même (CommentCaMarcheSection) est réutilisé tel quel : même logique,
// juste un nouvel emplacement — aucune duplication de code.
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

      <Reveal>
        <section style={{ position: "relative", backgroundColor: "var(--color-rosee)", padding: "clamp(56px, 10vw, 88px) 20px", textAlign: "center", overflow: "hidden" }}>
          <div className="akal-texture-topo" aria-hidden style={{ opacity: 0.35 }} />
          <div style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: "16px", justifyContent: "center" }}>
            <Link href="/parcelles">
              <button className="btn-primary" style={{ padding: "14px 32px", fontSize: "15px" }}>Explorer les parcelles</button>
            </Link>
            <Link href="/publier">
              <button className="btn-secondary" style={{ padding: "14px 32px", fontSize: "15px" }}>Déposer une annonce</button>
            </Link>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
