"use client";

// Modale de confirmation commune aux décisions de modération (valider,
// rejeter, suspendre, classer, suspendre un compte) et au signalement.
// `motifs` absent = simple confirmation ; présent = choix obligatoire,
// commentaire exigé pour « autre » (même règle que le backend).
import { useState } from "react";

export type ModaleDecisionProps = {
  titre: string;
  message: string;
  labelConfirmer: string;
  classeConfirmer?: string;
  motifs?: { code: string; libelle: string }[];
  placeholderCommentaire?: string;
  onConfirmer: (motif: string, commentaire: string) => Promise<string | null>; // message d'erreur ou null
  onFermer: () => void;
};

export function ModaleDecision({
  titre,
  message,
  labelConfirmer,
  classeConfirmer = "btn-primary",
  motifs,
  placeholderCommentaire = "Commentaire (facultatif)",
  onConfirmer,
  onFermer,
}: ModaleDecisionProps) {
  const [motif, setMotif] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const commentaireRequis = motif === "autre";
  const invalide = (motifs && !motif) || (commentaireRequis && !commentaire.trim());

  async function confirmer() {
    if (invalide || enCours) return;
    setEnCours(true);
    setErreur(null);
    const err = await onConfirmer(motif, commentaire.trim());
    setEnCours(false);
    if (err) setErreur(err);
  }

  return (
    <div
      role="presentation"
      onClick={() => !enCours && onFermer()}
      style={{
        position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(15,20,17,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-titre"
        className="card akal-pop-in"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460, width: "100%", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}
      >
        <h2 id="decision-titre" style={{ fontSize: 17, margin: 0 }}>{titre}</h2>
        <p style={{ fontSize: 14, color: "var(--color-secondaire)", margin: 0 }}>{message}</p>

        {motifs && (
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            Motif
            <select
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              className="select-chevron"
              style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-bordure)", fontSize: 14 }}
            >
              <option value="">Choisir un motif…</option>
              {motifs.map((m) => (
                <option key={m.code} value={m.code}>{m.libelle}</option>
              ))}
            </select>
          </label>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
          {commentaireRequis ? "Précision (obligatoire)" : "Commentaire"}
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={placeholderCommentaire}
            style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-bordure)", fontSize: 14, resize: "vertical" }}
          />
        </label>

        {erreur && <p role="alert" style={{ color: "var(--color-erreur)", fontSize: 13, margin: 0 }}>{erreur}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn-ghost" style={{ padding: "6px 14px", fontSize: 13 }} disabled={enCours} onClick={onFermer}>
            Annuler
          </button>
          <button
            type="button"
            className={classeConfirmer}
            style={{ padding: "6px 14px", fontSize: 13 }}
            disabled={enCours || invalide}
            onClick={confirmer}
          >
            {enCours ? "…" : labelConfirmer}
          </button>
        </div>
      </div>
    </div>
  );
}
