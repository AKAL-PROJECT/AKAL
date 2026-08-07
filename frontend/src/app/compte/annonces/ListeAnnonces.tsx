"use client";

// Liste + actions du dashboard propriétaire — extrait de page.tsx (Server
// Component) en composant client pour porter la modale de confirmation
// contrôlée ci-dessous. Remplace l'ancien window.confirm() de
// BoutonAvecConfirmation.tsx (supprimé) : deux problèmes distincts avec les
// dialogues natifs y ont mené —
//   1. accessibilité/cohérence visuelle : rendu non stylable, incohérent
//      d'un navigateur à l'autre, hors charte AKAL ;
//   2. empilement possible (incident constaté lors d'un test fonctionnel
//      2026-08-07 : deux confirm() coup sur coup — un sur "Archiver" d'une
//      annonce, un second sur "Marquer vendue" d'une AUTRE annonce restée
//      en file — ont pu aboutir à une confirmation involontaire).
// La modale ci-dessous est un état React unique (`confirmation`) : un seul
// dialogue peut exister à la fois, et TOUS les boutons d'action de TOUTES
// les annonces sont désactivés tant qu'une confirmation est ouverte ou
// qu'une action est en cours (`verrouille`) — il est donc structurellement
// impossible d'en déclencher un second avant que le premier ne soit résolu,
// plutôt que de compter sur le comportement bloquant (mais pas garanti
// partout, cf. incident ci-dessus) de window.confirm().
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import BadgeStatutAnnonce from "@/components/parcelles/BadgeStatutAnnonce";
import {
  archiverAnnonceAction,
  marquerVendueAnnonceAction,
  reactiverAnnonceAction,
  type ActionStatutResultat,
} from "@/app/actions/annonces";
import type { AnnonceProprietaire, StatutAnnonce } from "@/types/parcelle";

const ACTION_BTN_STYLE: React.CSSProperties = { padding: "6px 14px", fontSize: "13px", whiteSpace: "nowrap" };

const formatMAD = new Intl.NumberFormat("fr-MA");
const formatDate = new Intl.DateTimeFormat("fr-MA", { day: "numeric", month: "long", year: "numeric" });

type Confirmation = {
  annonceId: string;
  titreAnnonce: string;
  titreDialogue: string;
  message: string;
  labelConfirmer: string;
  classeConfirmer: string;
  nouveauStatut: StatutAnnonce;
  runner: (id: string) => Promise<ActionStatutResultat>;
};

export function ListeAnnonces({ annonces }: { annonces: AnnonceProprietaire[] }) {
  const [items, setItems] = useState(annonces);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [verrouille, setVerrouille] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Verrou global : tant qu'une confirmation est ouverte OU qu'une action
  // est en vol, plus aucun bouton d'action n'est cliquable — sur AUCUNE
  // annonce de la liste (pas seulement celle concernée). C'est la garantie
  // structurelle contre l'empilement décrite ci-dessus.
  const actionsBloquees = confirmation !== null || verrouille;

  function demanderConfirmation(c: Confirmation) {
    if (actionsBloquees) return;
    setErreur(null);
    setConfirmation(c);
  }

  async function confirmer() {
    if (!confirmation) return;
    setVerrouille(true);
    const resultat = await confirmation.runner(confirmation.annonceId);
    setVerrouille(false);
    setConfirmation(null);
    if (resultat.ok) {
      const nouveauStatut = confirmation.nouveauStatut;
      setItems((prev) => prev.map((a) => (a.id === confirmation.annonceId ? { ...a, statut: nouveauStatut } : a)));
    } else {
      setErreur(resultat.error);
    }
  }

  return (
    <>
      {erreur && (
        <p
          className="akal-alert-in"
          style={{
            color: "var(--color-erreur)",
            fontSize: 14,
            backgroundColor: "var(--color-erreur-fond)",
            border: "1px solid var(--color-erreur)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 14px",
            marginBottom: 16,
          }}
        >
          {erreur}
        </p>
      )}

      <div className="akal-stagger" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {items.map((a) => (
          <div
            key={a.id}
            className="card"
            style={{ display: "flex", alignItems: "center", gap: "16px", padding: "12px", flexWrap: "wrap" }}
          >
            <div
              style={{
                position: "relative",
                width: "72px",
                height: "72px",
                flexShrink: 0,
                borderRadius: "var(--radius-sm)",
                overflow: "hidden",
                backgroundColor: "var(--color-menthe)",
              }}
            >
              {a.photoPrincipale && (
                <Image src={a.photoPrincipale} alt={a.titre} fill sizes="72px" style={{ objectFit: "cover" }} />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 500,
                  color: "var(--color-texte)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {a.titre}
              </h3>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--color-tertiaire)" }}>
                <span>{a.surface} ha</span>
                <span>·</span>
                <span>Déposée le {formatDate.format(new Date(a.createdAt))}</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flexShrink: 0 }}>
              <BadgeStatutAnnonce statut={a.statut} />
              <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-foret)" }}>
                {formatMAD.format(a.prix)} MAD
              </span>
            </div>

            {/* Modification de contenu (titre/description/prix/localisation/
                photos) autorisée à n'importe quel statut depuis le 2026-08-07
                — le PATCH backend l'a toujours permis (P1 #4), seul /publier
                ne savait reprendre qu'un brouillon jusqu'ici, cf.
                DepotAnnonceWizard.tsx. */}
            <Link
              href={`/publier?id=${a.id}`}
              className="btn-secondary"
              style={{ flexShrink: 0, padding: "6px 14px", fontSize: "13px", textDecoration: "none" }}
            >
              Modifier
            </Link>

            {(a.statut === "en_ligne" || a.statut === "archivee" || a.statut === "vendue") && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0 }}>
                {a.statut === "en_ligne" && (
                  <>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={ACTION_BTN_STYLE}
                      disabled={actionsBloquees}
                      onClick={() =>
                        demanderConfirmation({
                          annonceId: a.id,
                          titreAnnonce: a.titre,
                          titreDialogue: "Archiver cette annonce ?",
                          message: `Archiver « ${a.titre} » ? Elle ne sera plus visible dans le catalogue public. Vous pourrez la réactiver plus tard.`,
                          labelConfirmer: "Archiver",
                          classeConfirmer: "btn-ghost",
                          nouveauStatut: "archivee",
                          runner: archiverAnnonceAction,
                        })
                      }
                    >
                      Archiver
                    </button>
                    <button
                      type="button"
                      className="btn-accent"
                      style={ACTION_BTN_STYLE}
                      disabled={actionsBloquees}
                      onClick={() =>
                        demanderConfirmation({
                          annonceId: a.id,
                          titreAnnonce: a.titre,
                          titreDialogue: "Marquer cette annonce comme vendue ?",
                          message: `Marquer « ${a.titre} » comme vendue ? Elle ne sera plus visible dans le catalogue public. Vous pourrez la remettre en vente depuis cette page si besoin.`,
                          labelConfirmer: "Marquer vendue",
                          classeConfirmer: "btn-accent",
                          nouveauStatut: "vendue",
                          runner: marquerVendueAnnonceAction,
                        })
                      }
                    >
                      Marquer vendue
                    </button>
                  </>
                )}
                {a.statut === "archivee" && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={ACTION_BTN_STYLE}
                    disabled={actionsBloquees}
                    onClick={() =>
                      demanderConfirmation({
                        annonceId: a.id,
                        titreAnnonce: a.titre,
                        titreDialogue: "Réactiver cette annonce ?",
                        message: `Remettre « ${a.titre} » en ligne dans le catalogue public ?`,
                        labelConfirmer: "Réactiver",
                        classeConfirmer: "btn-secondary",
                        nouveauStatut: "en_ligne",
                        runner: reactiverAnnonceAction,
                      })
                    }
                  >
                    Réactiver
                  </button>
                )}
                {a.statut === "vendue" && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={ACTION_BTN_STYLE}
                    disabled={actionsBloquees}
                    onClick={() =>
                      demanderConfirmation({
                        annonceId: a.id,
                        titreAnnonce: a.titre,
                        titreDialogue: "Remettre cette annonce en vente ?",
                        message: `Remettre « ${a.titre} » en vente ? Confirmez uniquement si la vente n'a pas réellement eu lieu — elle redeviendra visible et contactable dans le catalogue public.`,
                        labelConfirmer: "Remettre en vente",
                        classeConfirmer: "btn-secondary",
                        nouveauStatut: "en_ligne",
                        runner: reactiverAnnonceAction,
                      })
                    }
                  >
                    Remettre en vente
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {confirmation && (
        <div
          role="presentation"
          onClick={() => !verrouille && setConfirmation(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            backgroundColor: "rgba(15,20,17,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirmation-titre"
            aria-describedby="confirmation-message"
            className="card akal-pop-in"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 420, width: "100%", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
          >
            <h2 id="confirmation-titre" style={{ fontSize: 17, margin: 0 }}>
              {confirmation.titreDialogue}
            </h2>
            <p id="confirmation-message" style={{ fontSize: 14, color: "var(--color-secondaire)", margin: 0 }}>
              {confirmation.message}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <button
                type="button"
                className="btn-ghost"
                style={ACTION_BTN_STYLE}
                disabled={verrouille}
                onClick={() => setConfirmation(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className={confirmation.classeConfirmer}
                style={ACTION_BTN_STYLE}
                disabled={verrouille}
                onClick={confirmer}
              >
                {verrouille ? "…" : confirmation.labelConfirmer}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
