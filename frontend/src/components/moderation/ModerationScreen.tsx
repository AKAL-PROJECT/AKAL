"use client";

// Dashboard modérateur (/moderation) — deux onglets :
//   - File : annonces en attente (signal automatique, republication après
//     décision) et annonces en ligne signalées par des utilisateurs. Chaque
//     ligne ouvre la fiche de revue (/moderation/[id]), où se prennent les
//     décisions — jamais depuis la liste, pour décider sur le dossier
//     complet plutôt que sur une vignette.
//   - Journal : les 100 dernières décisions (qui, quand, quoi, pourquoi).
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { EtatVide } from "@/components/EtatVide";
import BadgeStatutAnnonce from "@/components/parcelles/BadgeStatutAnnonce";
import { libelleMotif } from "@/lib/moderation-motifs";
import type { AnnonceModerationDTO, DecisionModerationDTO } from "@/lib/moderation-api";

const formatMAD = new Intl.NumberFormat("fr-MA");
const formatDateHeure = new Intl.DateTimeFormat("fr-MA", { dateStyle: "medium", timeStyle: "short" });

const STYLE_PASTILLE: React.CSSProperties = {
  fontSize: 12, padding: "2px 8px", borderRadius: 999, fontWeight: 500, whiteSpace: "nowrap",
};

export function ModerationScreen({
  annonces,
  journal,
}: {
  annonces: AnnonceModerationDTO[];
  journal: DecisionModerationDTO[];
}) {
  const [onglet, setOnglet] = useState<"file" | "journal">("file");
  const nbSignalees = annonces.filter((a) => a.nb_signalements > 0).length;

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 600, color: "var(--color-nuit)", marginBottom: "4px" }}>Modération</h1>
      <p style={{ fontSize: "14px", color: "var(--color-tertiaire)", marginBottom: "20px" }}>
        {annonces.length} annonce{annonces.length === 1 ? "" : "s"} à revoir
        {nbSignalees > 0 && ` dont ${nbSignalees} signalée${nbSignalees === 1 ? "" : "s"} par des utilisateurs`}.
      </p>

      <div role="tablist" aria-label="Modération" style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid var(--color-bordure)" }}>
        {([["file", `File (${annonces.length})`], ["journal", "Journal"]] as const).map(([cle, libelle]) => (
          <button
            key={cle}
            type="button"
            role="tab"
            aria-selected={onglet === cle}
            onClick={() => setOnglet(cle)}
            className="akal-focusable"
            style={{
              padding: "10px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 14,
              fontWeight: onglet === cle ? 600 : 400,
              color: onglet === cle ? "var(--color-foret)" : "var(--color-secondaire)",
              borderBottom: onglet === cle ? "2px solid var(--color-foret)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {libelle}
          </button>
        ))}
      </div>

      {onglet === "file" ? (
        annonces.length === 0 ? (
          <EtatVide titre="File vide" description="Aucune annonce à revoir pour l'instant." />
        ) : (
          <div className="akal-stagger" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {annonces.map((a) => (
              <Link
                key={a.id}
                href={`/moderation/${a.id}`}
                className="card akal-focusable"
                style={{ display: "flex", gap: "16px", padding: "14px", alignItems: "center", textDecoration: "none", color: "inherit", flexWrap: "wrap" }}
              >
                <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0, borderRadius: "var(--radius-sm)", overflow: "hidden", backgroundColor: "var(--color-menthe)" }}>
                  {a.photo_principale && <Image src={a.photo_principale} alt="" fill sizes="80px" style={{ objectFit: "cover" }} />}
                </div>
                <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <BadgeStatutAnnonce statut={a.statut} />
                    {a.nb_signalements > 0 && (
                      <span style={{ ...STYLE_PASTILLE, backgroundColor: "var(--color-erreur-fond)", color: "var(--color-erreur)" }}>
                        {a.nb_signalements} signalement{a.nb_signalements === 1 ? "" : "s"}
                      </span>
                    )}
                    {a.statut === "en_attente" && a.motif_moderation && (
                      <span style={{ ...STYLE_PASTILLE, backgroundColor: "var(--color-terre-fond)", color: "var(--color-terre-texte)" }}>
                        Signal automatique
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{a.titre}</span>
                  <span style={{ fontSize: 13, color: "var(--color-secondaire)" }}>
                    {formatMAD.format(a.prix_mad)} MAD · {a.parcelle.surface_ha} ha{a.parcelle.region ? ` · ${a.parcelle.region.nom}` : ""}
                  </span>
                  {a.motif_moderation && (
                    <span style={{ fontSize: 12, color: "var(--color-erreur)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      ⚠ {a.motif_moderation}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 13, color: "var(--color-foret)", fontWeight: 500, flexShrink: 0 }}>Examiner →</span>
              </Link>
            ))}
          </div>
        )
      ) : journal.length === 0 ? (
        <EtatVide titre="Aucune décision" description="Les décisions de modération apparaîtront ici." />
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {journal.map((d) => (
            <li key={d.id} className="card" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14 }}>{d.action_libelle}</strong>
                <span style={{ fontSize: 12, color: "var(--color-tertiaire)" }}>{formatDateHeure.format(new Date(d.created_at))}</span>
              </div>
              <span style={{ fontSize: 13, color: "var(--color-secondaire)" }}>
                {d.annonce_id ? (
                  <Link href={`/moderation/${d.annonce_id}`} style={{ color: "var(--color-foret)" }}>{d.titre_annonce || "Annonce"}</Link>
                ) : d.utilisateur_cible_id ? (
                  <Link href={`/moderation/vendeurs/${d.utilisateur_cible_id}`} style={{ color: "var(--color-foret)" }}>Voir le compte</Link>
                ) : (
                  d.titre_annonce
                )}
                {" · par "}{d.moderateur ?? "—"}
                {d.motif && ` · ${libelleMotif(d.motif)}`}
              </span>
              {d.commentaire && <span style={{ fontSize: 13 }}>« {d.commentaire} »</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
