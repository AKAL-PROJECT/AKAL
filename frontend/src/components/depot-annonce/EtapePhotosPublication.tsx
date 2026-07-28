"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import Image from "next/image";
import { X } from "@/components/icons/Icons";
import { ajouterPhotosAction, publierAction, supprimerPhotoAction } from "@/app/actions/depot-annonce";
import type { AnnonceEcriture } from "@/types/depot-annonce";

// Compression client obligatoire (mission F03) : le serveur revalide ensuite
// systématiquement (≤2 Mo, contenu image réel) — on ne fait jamais confiance
// au client, cette compression n'est qu'une optimisation de bande passante.
const OPTIONS_COMPRESSION = {
  maxSizeMB: 2,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
};

export function EtapePhotosPublication({
  annonce,
  onPrecedent,
  onAnnonceMiseAJour,
}: {
  annonce: AnnonceEcriture;
  onPrecedent: () => void;
  onAnnonceMiseAJour: (annonce: AnnonceEcriture) => void;
}) {
  const router = useRouter();
  const [enCompression, setEnCompression] = useState(false);
  const [erreurUpload, setErreurUpload] = useState<string | null>(null);
  const [pendingPublication, startTransition] = useTransition();
  const [publiee, setPubliee] = useState(annonce.statut === "en_ligne");
  const [raisonsBlocage, setRaisonsBlocage] = useState<string[] | null>(null);
  const [erreurPublication, setErreurPublication] = useState<string | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState<string | null>(null);
  const [erreurSuppression, setErreurSuppression] = useState<string | null>(null);

  async function gererSuppression(photoId: string) {
    setErreurSuppression(null);
    setSuppressionEnCours(photoId);
    try {
      const resultat = await supprimerPhotoAction(annonce.id, photoId);
      if (resultat?.annonce) {
        onAnnonceMiseAJour(resultat.annonce);
      } else if (resultat?.error) {
        setErreurSuppression(resultat.error);
      }
    } finally {
      setSuppressionEnCours(null);
    }
  }

  async function gererSelectionFichiers(e: React.ChangeEvent<HTMLInputElement>) {
    const fichiers = Array.from(e.target.files ?? []);
    e.target.value = ""; // autorise de re-sélectionner le même fichier après une erreur
    if (fichiers.length === 0) return;

    setErreurUpload(null);
    setEnCompression(true);
    try {
      const compresses = await Promise.all(fichiers.map((f) => imageCompression(f, OPTIONS_COMPRESSION)));
      const formData = new FormData();
      for (const fichier of compresses) formData.append("photos", fichier, fichier.name);

      const resultat = await ajouterPhotosAction(annonce.id, formData);
      if (resultat?.annonce) {
        onAnnonceMiseAJour(resultat.annonce);
      } else if (resultat?.error) {
        setErreurUpload(resultat.error);
      }
    } catch {
      setErreurUpload("La compression ou l'envoi des photos a échoué. Réessayez.");
    } finally {
      setEnCompression(false);
    }
  }

  function gererPublication() {
    setErreurPublication(null);
    setRaisonsBlocage(null);
    startTransition(async () => {
      const resultat = await publierAction(annonce.id);
      if (resultat?.annonce) {
        onAnnonceMiseAJour(resultat.annonce);
        setPubliee(true);
        router.push(`/parcelles/${resultat.annonce.slug}`);
      } else if (resultat?.fieldErrors?.statut) {
        setRaisonsBlocage(resultat.fieldErrors.statut);
      } else if (resultat?.error) {
        setErreurPublication(resultat.error);
      }
    });
  }

  if (publiee) {
    return (
      <div style={{ textAlign: "center", padding: "24px 0" }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Votre annonce est en ligne</h2>
        <p style={{ color: "var(--color-secondaire)" }}>Redirection vers votre annonce…</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Ajoutez des photos</h2>
        <p style={{ fontSize: 14, color: "var(--color-secondaire)", margin: 0 }}>
          Au moins une photo est nécessaire pour publier votre annonce.
        </p>
      </div>

      {annonce.photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 10 }}>
          {annonce.photos.map((photo) => (
            <div
              key={photo.id}
              style={{
                position: "relative",
                aspectRatio: "1",
                borderRadius: 8,
                overflow: "hidden",
                border: "1px solid var(--color-bordure)",
                backgroundColor: "var(--color-fond-input)",
              }}
            >
              {photo.url && <Image src={photo.url} alt="" fill style={{ objectFit: "cover" }} sizes="96px" />}
              <button
                type="button"
                onClick={() => gererSuppression(photo.id)}
                disabled={suppressionEnCours === photo.id}
                aria-label="Supprimer cette photo"
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  backgroundColor: "rgba(0,0,0,0.6)",
                  color: "white",
                  border: "none",
                  cursor: suppressionEnCours === photo.id ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {erreurSuppression && <p style={{ color: "#C0392B", fontSize: 14 }}>{erreurSuppression}</p>}

      <label
        className="btn-secondary"
        style={{
          textAlign: "center",
          cursor: enCompression ? "wait" : "pointer",
          opacity: enCompression ? 0.6 : 1,
        }}
      >
        {enCompression ? "Compression en cours…" : "Ajouter des photos"}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={gererSelectionFichiers}
          disabled={enCompression}
          style={{ display: "none" }}
        />
      </label>
      {erreurUpload && <p style={{ color: "#C0392B", fontSize: 14 }}>{erreurUpload}</p>}

      {raisonsBlocage && (
        <div style={{ backgroundColor: "#FEF3EE", border: "1px solid var(--color-terre)", borderRadius: 8, padding: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-terre)", margin: "0 0 6px" }}>
            Impossible de publier pour le moment :
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "var(--color-texte)" }}>
            {raisonsBlocage.map((raison) => (
              <li key={raison}>{raison}</li>
            ))}
          </ul>
        </div>
      )}
      {erreurPublication && <p style={{ color: "#C0392B", fontSize: 14 }}>{erreurPublication}</p>}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <button type="button" className="btn-secondary" onClick={onPrecedent}>
          Précédent
        </button>
        <button type="button" className="btn-primary" onClick={gererPublication} disabled={pendingPublication}>
          {pendingPublication ? "Publication…" : "Publier l'annonce"}
        </button>
      </div>
    </div>
  );
}
