import Link from "next/link";
import { Reveal } from "@/components/Reveal";

// Deux parcours distincts (acheteur / vendeur) — AKAL sert les deux côtés
// du marché (recherche de parcelle ET dépôt d'annonce). Côte à côte,
// toujours visibles (calque 1f du handoff design, 11 sept) — remplace
// l'ancienne bascule à onglets (un seul parcours visible à la fois,
// nécessaire quand ce composant vivait aussi en aperçu compact sur la
// home ; il n'est plus utilisé que sur /comment-ca-marche depuis le
// retrait de CommentCaMarcheTeaser.tsx le 17/08, plus de contrainte de
// hauteur à ménager). Plus de state ni de tabs : Server Component.
const PARCOURS = {
  acheteur: {
    label: "Vous cherchez une terre",
    sombre: false,
    cta: { label: "Explorer les parcelles", href: "/parcelles" },
    etapes: [
      { num: "01", titre: "Explorez", desc: "Parcourez des parcelles partout au Maroc, avec leur statut foncier déclaré. Filtrez par région et budget." },
      { num: "02", titre: "Comparez", desc: "Statut foncier, accès à l'eau, prix au m² — comparez les parcelles côte à côte." },
      { num: "03", titre: "Contactez", desc: "Échangez directement avec le vendeur, sans intermédiaire." },
    ],
  },
  vendeur: {
    label: "Vous avez une terre",
    sombre: true,
    cta: { label: "Déposer une annonce", href: "/publier" },
    etapes: [
      { num: "01", titre: "Déposez", desc: "Décrivez votre parcelle, localisez-la sur la carte et ajoutez vos photos — en 3 étapes." },
      { num: "02", titre: "Échangez", desc: "Recevez les messages des acheteurs intéressés, directement, sans intermédiaire." },
      { num: "03", titre: "Vendez", desc: "Marquez l'annonce vendue une fois la transaction conclue, depuis votre tableau de bord." },
    ],
  },
} as const;

export default function CommentCaMarcheSection() {
  return (
    <section id="comment-ca-marche" style={{ maxWidth: "1080px", margin: "0 auto clamp(64px, 10vw, 120px)", padding: "0 24px" }}>
      <Reveal>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <span className="eyebrow" style={{ justifyContent: "center" }}>Fonctionnement</span>
          <h2 className="display-2" style={{ color: "var(--color-nuit)", margin: "14px 0 0" }}>Comment ça marche</h2>
        </div>
      </Reveal>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
        {(Object.keys(PARCOURS) as (keyof typeof PARCOURS)[]).map((cle, i) => {
          const { label, sombre, cta, etapes } = PARCOURS[cle];
          return (
            <Reveal key={cle} delayMs={i * 90}>
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: "var(--radius-md)",
                  padding: "28px 30px",
                  boxSizing: "border-box",
                  // Carte vendeur en fond sombre — même motif que le panneau
                  // "Passeport agronomique" (FicheParcelle.tsx) et "Espace
                  // vendeur" (ProfilCarte.tsx), cohérence visuelle plutôt
                  // qu'un nouveau ton pour cette seule page.
                  background: sombre ? "var(--gradient-profondeur)" : "white",
                  border: sombre ? "none" : "1px solid var(--color-bordure)",
                  boxShadow: sombre ? "var(--shadow-2)" : "0 4px 16px rgba(27,58,45,0.06)",
                }}
              >
                <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: sombre ? "var(--color-menthe)" : "var(--color-foret)" }}>
                  {label}
                </span>

                <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginTop: "22px" }}>
                  {etapes.map(({ num, titre, desc }) => (
                    <div key={titre} style={{ display: "flex", gap: "14px" }}>
                      <span
                        style={{
                          flexShrink: 0,
                          width: "32px",
                          height: "32px",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "13px",
                          fontWeight: 600,
                          backgroundColor: sombre ? "rgba(183,215,201,0.16)" : "var(--color-rosee)",
                          color: sombre ? "var(--color-menthe)" : "var(--color-foret)",
                        }}
                      >
                        {num}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "15px", fontWeight: 600, color: sombre ? "white" : "var(--color-nuit)" }}>{titre}</div>
                        <div style={{ fontSize: "13.5px", lineHeight: 1.6, marginTop: "4px", color: sombre ? "var(--color-menthe)" : "var(--color-secondaire)" }}>{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* btn-secondary (fond blanc) sur la carte sombre, pas
                    btn-primary : ce dernier est vert forêt — quasi invisible
                    sur un fond qui dégrade vers ce même vert
                    (--gradient-profondeur). */}
                <Link href={cta.href} style={{ marginTop: "26px", alignSelf: "flex-start", textDecoration: "none" }}>
                  <button className={sombre ? "btn-secondary" : "btn-primary"} style={{ padding: "12px 24px", fontSize: "14px" }}>
                    {cta.label}
                  </button>
                </Link>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
