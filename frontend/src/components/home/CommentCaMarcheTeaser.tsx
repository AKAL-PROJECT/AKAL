import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { Search, FileText, MessageSquare, ArrowRight } from "@/components/icons/Icons";

// Version allégée de "Comment ça marche" pour la homepage (P1-04) — 3
// puces plutôt que les 6 étapes détaillées à onglets acheteur/vendeur, qui
// vivent maintenant sur leur propre page (/comment-ca-marche,
// CommentCaMarcheSection.tsx réutilisé tel quel là-bas). La home garde
// juste de quoi comprendre le principe en un coup d'œil + un lien pour
// approfondir.
const POINTS = [
  { icone: Search, texte: "Explorez ou déposez une parcelle" },
  { icone: FileText, texte: "Statut foncier déclaré par le vendeur" },
  { icone: MessageSquare, texte: "Échange direct, sans intermédiaire" },
];

export default function CommentCaMarcheTeaser() {
  return (
    <section id="comment-ca-marche" style={{ maxWidth: "1000px", margin: "0 auto clamp(64px, 10vw, 120px)", padding: "0 24px" }}>
      <Reveal>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "32px",
            padding: "clamp(32px, 5vw, 48px)",
            backgroundColor: "var(--color-rosee)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div style={{ maxWidth: "420px" }}>
            <span className="eyebrow">Fonctionnement</span>
            <h2 className="display-2" style={{ color: "var(--color-nuit)", margin: "14px 0 12px" }}>
              Comment ça marche
            </h2>
            <p style={{ fontSize: "14px", color: "var(--color-secondaire)", lineHeight: 1.6, margin: 0 }}>
              Un parcours simple, que vous cherchiez une terre ou que vous en vendiez une.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {POINTS.map(({ icone: Icone, texte }) => (
              <div key={texte} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "white", color: "var(--color-foret)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-1)" }}>
                  <Icone size={15} strokeWidth={1.75} />
                </span>
                <span style={{ fontSize: "14px", color: "var(--color-texte)" }}>{texte}</span>
              </div>
            ))}
            <Link href="/comment-ca-marche" className="akal-link-fleche" style={{ marginTop: "4px" }}>
              Voir le détail des parcours
              <ArrowRight size={14} style={{ marginLeft: "6px" }} />
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
