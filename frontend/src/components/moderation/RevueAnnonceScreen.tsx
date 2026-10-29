"use client";

// Fiche de revue d'une annonce (/moderation/[id]) : tout ce qu'il faut pour
// décider — photos, texte, caractéristiques, position EXACTE (jamais
// floutée pour un modérateur), signaux automatiques, signalements des
// utilisateurs, historique des décisions et dossier du vendeur. Chaque
// décision passe par une modale de confirmation ; rejeter et suspendre
// exigent un motif, transmis au vendeur.
import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BadgeStatutAnnonce from "@/components/parcelles/BadgeStatutAnnonce";
import { ChevronLeft } from "@/components/icons/Icons";
import { deciderAction } from "@/app/actions/moderation";
import { MOTIFS_DECISION, libelleMotif } from "@/lib/moderation-motifs";
import type { Decision, RevueAnnonceDTO } from "@/lib/moderation-api";
import type { Parcelle } from "@/types/parcelle";
import { ModaleDecision, type ModaleDecisionProps } from "./ModaleDecision";

const CarteFiche = dynamic(() => import("@/components/parcelles/CarteLeafletFiche"), { ssr: false });

const formatMAD = new Intl.NumberFormat("fr-MA");
const formatDate = new Intl.DateTimeFormat("fr-MA", { dateStyle: "medium" });
const formatDateHeure = new Intl.DateTimeFormat("fr-MA", { dateStyle: "medium", timeStyle: "short" });

const SECTION: React.CSSProperties = { padding: 18, display: "flex", flexDirection: "column", gap: 10 };
const TITRE_SECTION: React.CSSProperties = { fontSize: 15, fontWeight: 600, margin: 0 };

type ConfigModale = Omit<ModaleDecisionProps, "onConfirmer" | "onFermer"> & { decision: Decision };

export function RevueAnnonceScreen({
  revue,
  parcelle,
  peutSuspendreComptes,
}: {
  revue: RevueAnnonceDTO;
  parcelle: Parcelle;
  peutSuspendreComptes: boolean;
}) {
  const router = useRouter();
  const [modale, setModale] = useState<ConfigModale | null>(null);
  const signalementsOuverts = revue.signalements.filter((s) => s.statut === "ouvert");
  const p = revue.parcelle;

  const actions: ConfigModale[] =
    revue.statut === "en_attente"
      ? [
          {
            decision: "valider", titre: "Valider cette annonce ?", labelConfirmer: "Valider et publier",
            message: "L'annonce sera publiée dans le catalogue et le vendeur sera prévenu.",
          },
          {
            decision: "rejeter", titre: "Rejeter cette annonce ?", labelConfirmer: "Rejeter",
            classeConfirmer: "btn-secondary", motifs: MOTIFS_DECISION,
            placeholderCommentaire: "Ce que le vendeur doit corriger (il recevra ce message)",
            message: "L'annonce repasse en brouillon. Le vendeur reçoit le motif et devra la corriger avant une nouvelle revue.",
          },
        ]
      : revue.statut === "en_ligne"
        ? [
            ...(signalementsOuverts.length > 0
              ? [{
                  decision: "classer" as const, titre: "Classer les signalements sans suite ?",
                  labelConfirmer: "Classer sans suite",
                  message: "Les signalements sont jugés infondés : l'annonce reste en ligne et sort de la file.",
                }]
              : []),
            {
              decision: "suspendre", titre: "Suspendre cette annonce ?", labelConfirmer: "Suspendre",
              classeConfirmer: "btn-secondary", motifs: MOTIFS_DECISION,
              placeholderCommentaire: "Ce que le vendeur doit corriger (il recevra ce message)",
              message: "L'annonce est retirée du catalogue. Sa remise en ligne par le vendeur repassera par la modération.",
            },
          ]
        : [];

  async function confirmer(config: ConfigModale, motif: string, commentaire: string) {
    const resultat = await deciderAction(revue.id, config.decision, motif, commentaire);
    if (!resultat.ok) return resultat.error;
    setModale(null);
    router.push("/moderation");
    return null;
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 48px" }}>
      <Link href="/moderation" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--color-secondaire)", marginBottom: 12 }}>
        <ChevronLeft size={14} /> Retour à la file
      </Link>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
        <BadgeStatutAnnonce statut={revue.statut} />
        {revue.source && revue.source !== "interne" && (
          <span style={{ fontSize: 12, color: "var(--color-tertiaire)" }}>Importée de {revue.source}</span>
        )}
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 4px" }}>{revue.titre}</h1>
      <p style={{ fontSize: 15, color: "var(--color-foret)", fontWeight: 500, margin: "0 0 20px" }}>
        {formatMAD.format(revue.prix_mad)} MAD · {p.surface_ha} ha
        {revue.statut === "en_ligne" && (
          <> · <Link href={`/parcelles/${revue.slug}`} style={{ color: "var(--color-foret)" }}>voir la fiche publique</Link></>
        )}
      </p>

      <div className="akal-revue-grille" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {(revue.motif_moderation || signalementsOuverts.length > 0) && (
            <section className="card" style={{ ...SECTION, borderLeft: "3px solid var(--color-erreur)" }}>
              <h2 style={TITRE_SECTION}>Pourquoi cette annonce est dans la file</h2>
              {revue.motif_moderation && <p style={{ fontSize: 13, margin: 0 }}>⚠ {revue.motif_moderation}</p>}
              {signalementsOuverts.map((s) => (
                <div key={s.id} style={{ fontSize: 13, borderTop: "1px solid var(--color-bordure)", paddingTop: 8 }}>
                  <strong>{s.raison_libelle}</strong>{" "}
                  <span style={{ color: "var(--color-tertiaire)" }}>— {s.auteur.prenom} ({s.auteur.email}), {formatDate.format(new Date(s.created_at))}</span>
                  {s.commentaire && <p style={{ margin: "4px 0 0" }}>« {s.commentaire} »</p>}
                </div>
              ))}
            </section>
          )}

          <section className="card" style={SECTION}>
            <h2 style={TITRE_SECTION}>Photos ({revue.photos.length})</h2>
            {revue.photos.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--color-tertiaire)", margin: 0 }}>Aucune photo.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                {revue.photos.map((photo, i) => (
                  <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer" style={{ position: "relative", aspectRatio: "4 / 3", borderRadius: "var(--radius-sm)", overflow: "hidden", backgroundColor: "var(--color-menthe)" }}>
                    <Image src={photo.url} alt={`Photo ${i + 1}`} fill sizes="200px" style={{ objectFit: "cover" }} />
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="card" style={SECTION}>
            <h2 style={TITRE_SECTION}>Description</h2>
            <p style={{ fontSize: 14, whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.6 }}>{revue.description}</p>
          </section>

          <section className="card" style={SECTION}>
            <h2 style={TITRE_SECTION}>Caractéristiques et localisation</h2>
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", fontSize: 13, margin: 0 }}>
              <dt style={{ color: "var(--color-tertiaire)" }}>Statut foncier</dt><dd style={{ margin: 0 }}>{p.statut_foncier ?? "—"}</dd>
              <dt style={{ color: "var(--color-tertiaire)" }}>Accès à l&apos;eau</dt><dd style={{ margin: 0 }}>{p.acces_eau ?? "—"}</dd>
              <dt style={{ color: "var(--color-tertiaire)" }}>Commune</dt><dd style={{ margin: 0 }}>{[p.commune, p.province, p.region?.nom].filter(Boolean).join(", ") || "—"}</dd>
              <dt style={{ color: "var(--color-tertiaire)" }}>Coordonnées exactes</dt>
              <dd style={{ margin: 0 }}>
                {p.localisation.latitude != null ? `${p.localisation.latitude.toFixed(5)}, ${p.localisation.longitude.toFixed(5)}` : "—"}
                {revue.loc_confidentielle && " (masquées au public)"}
              </dd>
            </dl>
            {p.localisation.latitude != null && (
              <div style={{ height: 260, borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                <CarteFiche parcelle={parcelle} />
              </div>
            )}
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <section className="card" style={SECTION}>
            <h2 style={TITRE_SECTION}>Décision</h2>
            {actions.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--color-tertiaire)", margin: 0 }}>
                Aucune décision possible pour une annonce « {revue.statut} ».
              </p>
            ) : (
              actions.map((a, i) => (
                <button
                  key={a.decision}
                  type="button"
                  className={i === 0 ? "btn-primary" : "btn-secondary"}
                  style={{ padding: "10px 14px", fontSize: 14 }}
                  onClick={() => setModale(a)}
                >
                  {a.labelConfirmer}
                </button>
              ))
            )}
          </section>

          <section className="card" style={SECTION}>
            <h2 style={TITRE_SECTION}>Vendeur</h2>
            <p style={{ fontSize: 14, margin: 0 }}>
              <strong>{revue.vendeur.prenom} {revue.vendeur.nom}</strong>
              {!revue.vendeur.is_active && <span style={{ color: "var(--color-erreur)" }}> — compte suspendu</span>}
            </p>
            <p style={{ fontSize: 13, color: "var(--color-secondaire)", margin: 0, overflowWrap: "anywhere" }}>
              {revue.vendeur.email}
              {revue.vendeur.telephone && <><br />{revue.vendeur.telephone}{revue.vendeur.telephone_verifie ? " (vérifié)" : " (non vérifié)"}</>}
            </p>
            <p style={{ fontSize: 13, color: "var(--color-tertiaire)", margin: 0 }}>
              Inscrit le {formatDate.format(new Date(revue.vendeur.date_inscription))} · {revue.vendeur.nb_annonces} annonce(s),
              {" "}{revue.vendeur.nb_annonces_en_ligne} en ligne · {revue.vendeur.nb_rejets} rejet(s) ou suspension(s)
            </p>
            {(peutSuspendreComptes || revue.vendeur.nb_annonces > 1) && (
              <Link href={`/moderation/vendeurs/${revue.vendeur.id}`} style={{ fontSize: 13, color: "var(--color-foret)", fontWeight: 500 }}>
                Dossier du vendeur →
              </Link>
            )}
          </section>

          <section className="card" style={SECTION}>
            <h2 style={TITRE_SECTION}>Historique</h2>
            {revue.historique.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--color-tertiaire)", margin: 0 }}>Aucune décision précédente.</p>
            ) : (
              revue.historique.map((d) => (
                <div key={d.id} style={{ fontSize: 13 }}>
                  <strong>{d.action_libelle}</strong>{" "}
                  <span style={{ color: "var(--color-tertiaire)" }}>— {d.moderateur ?? "—"}, {formatDateHeure.format(new Date(d.created_at))}</span>
                  {(d.motif || d.commentaire) && (
                    <p style={{ margin: "2px 0 0", color: "var(--color-secondaire)" }}>
                      {d.motif && libelleMotif(d.motif)}{d.motif && d.commentaire && " — "}{d.commentaire}
                    </p>
                  )}
                </div>
              ))
            )}
          </section>
        </div>
      </div>

      {modale && (
        <ModaleDecision
          {...modale}
          onFermer={() => setModale(null)}
          onConfirmer={(motif, commentaire) => confirmer(modale, motif, commentaire)}
        />
      )}
    </div>
  );
}
