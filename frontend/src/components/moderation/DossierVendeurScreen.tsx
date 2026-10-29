"use client";

// Dossier d'un vendeur (/moderation/vendeurs/[id]) : identité, toutes ses
// annonces, décisions le concernant, et suspension / réactivation du compte
// (permission accounts.suspendre_utilisateur). Suspendre retire toutes ses
// annonces du catalogue et bloque sa connexion — réversible.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BadgeStatutAnnonce from "@/components/parcelles/BadgeStatutAnnonce";
import { ChevronLeft } from "@/components/icons/Icons";
import { changerStatutVendeurAction } from "@/app/actions/moderation";
import { MOTIFS_DECISION, libelleMotif } from "@/lib/moderation-motifs";
import type { DossierVendeurDTO } from "@/lib/moderation-api";
import { ModaleDecision } from "./ModaleDecision";

const formatDate = new Intl.DateTimeFormat("fr-MA", { dateStyle: "medium" });
const formatDateHeure = new Intl.DateTimeFormat("fr-MA", { dateStyle: "medium", timeStyle: "short" });

export function DossierVendeurScreen({ dossier, peutSuspendre }: { dossier: DossierVendeurDTO; peutSuspendre: boolean }) {
  const router = useRouter();
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const { vendeur, annonces, historique } = dossier;
  const suspendre = vendeur.is_active;

  async function confirmer(motif: string, commentaire: string) {
    const resultat = await changerStatutVendeurAction(vendeur.id, !suspendre, motif, commentaire);
    if (!resultat.ok) return resultat.error;
    setModaleOuverte(false);
    router.refresh();
    return null;
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px 48px", display: "flex", flexDirection: "column", gap: 16 }}>
      <Link href="/moderation" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--color-secondaire)" }}>
        <ChevronLeft size={14} /> Retour à la file
      </Link>

      <section className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
          {vendeur.prenom} {vendeur.nom}
          {!vendeur.is_active && <span style={{ fontSize: 14, color: "var(--color-erreur)" }}> — compte suspendu</span>}
        </h1>
        <p style={{ fontSize: 13, color: "var(--color-secondaire)", margin: 0, overflowWrap: "anywhere" }}>
          {vendeur.email}{vendeur.telephone && ` · ${vendeur.telephone}${vendeur.telephone_verifie ? " (vérifié)" : " (non vérifié)"}`}
        </p>
        <p style={{ fontSize: 13, color: "var(--color-tertiaire)", margin: 0 }}>
          Inscrit le {formatDate.format(new Date(vendeur.date_inscription))} · {vendeur.nb_annonces} annonce(s) dont{" "}
          {vendeur.nb_annonces_en_ligne} en ligne · {vendeur.nb_rejets} rejet(s) ou suspension(s)
        </p>
        {peutSuspendre && !vendeur.est_equipe && (
          <div>
            <button
              type="button"
              className={suspendre ? "btn-secondary" : "btn-primary"}
              style={{ padding: "8px 14px", fontSize: 13, ...(suspendre ? { color: "var(--color-erreur)" } : {}) }}
              onClick={() => setModaleOuverte(true)}
            >
              {suspendre ? "Suspendre le compte" : "Réactiver le compte"}
            </button>
          </div>
        )}
      </section>

      <section className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Annonces ({annonces.length})</h2>
        {annonces.map((a) => (
          <Link key={a.id} href={`/moderation/${a.id}`} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 14, color: "inherit", textDecoration: "none" }}>
            <BadgeStatutAnnonce statut={a.statut} />
            <span style={{ flex: 1, minWidth: 160 }}>{a.titre}</span>
            {a.nb_signalements > 0 && <span style={{ fontSize: 12, color: "var(--color-erreur)" }}>{a.nb_signalements} signalement(s)</span>}
          </Link>
        ))}
      </section>

      <section className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Décisions le concernant</h2>
        {historique.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-tertiaire)", margin: 0 }}>Aucune.</p>
        ) : (
          historique.map((d) => (
            <p key={d.id} style={{ fontSize: 13, margin: 0 }}>
              <strong>{d.action_libelle}</strong>{d.titre_annonce && ` — ${d.titre_annonce}`}{" "}
              <span style={{ color: "var(--color-tertiaire)" }}>({d.moderateur ?? "—"}, {formatDateHeure.format(new Date(d.created_at))})</span>
              {d.motif && ` · ${libelleMotif(d.motif)}`}{d.commentaire && ` · « ${d.commentaire} »`}
            </p>
          ))
        )}
      </section>

      {modaleOuverte && (
        <ModaleDecision
          titre={suspendre ? "Suspendre ce compte ?" : "Réactiver ce compte ?"}
          message={
            suspendre
              ? "Le vendeur ne pourra plus se connecter et toutes ses annonces disparaîtront du catalogue. Vous pourrez réactiver le compte plus tard."
              : "Le vendeur pourra de nouveau se connecter et ses annonces en ligne réapparaîtront dans le catalogue."
          }
          labelConfirmer={suspendre ? "Suspendre" : "Réactiver"}
          classeConfirmer={suspendre ? "btn-secondary" : "btn-primary"}
          motifs={suspendre ? MOTIFS_DECISION : undefined}
          onFermer={() => setModaleOuverte(false)}
          onConfirmer={confirmer}
        />
      )}
    </div>
  );
}
