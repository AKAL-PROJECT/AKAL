"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import Image from "next/image";
import { X, Check } from "@/components/icons/Icons";
import { ajouterPhotosAction, publierAction, supprimerPhotoAction } from "@/app/actions/depot-annonce";
import type { AnnonceEcriture } from "@/types/depot-annonce";

// Compression client obligatoire (mission F03) : le serveur revalide ensuite
// systématiquement (≤2 Mo, contenu image réel) — on ne fait jamais confiance
// au client, cette compression n'est qu'une optimisation de bande passante.
//
// libURL auto-hébergé (2026-08-14) : useWebWorker: true fait tourner la
// compression dans un Web Worker qui charge le CODE de la librairie via
// importScripts() — et browser-image-compression pointe ça par défaut vers
// https://cdn.jsdelivr.net/... (cf. son README, section CSP). Sur un réseau
// qui bloque/ralentit ce CDN (proxy, ad-blocker, poste sans accès internet),
// la Promise de imageCompression() ne se résout ni ne rejette jamais : le
// bouton "Ajouter des photos" reste figé sur "Compression en cours…" sans
// la moindre erreur — symptôme rapporté "ne répond pas". On sert donc notre
// propre copie statique (public/vendor/, copiée depuis
// node_modules/browser-image-compression/dist/) plutôt que de dépendre d'un
// CDN tiers au moment critique de l'upload.
const OPTIONS_COMPRESSION = {
  maxSizeMB: 2,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  libURL: "/vendor/browser-image-compression.js",
};

export function EtapePhotosPublication({
  annonce,
  onPrecedent,
  onAnnonceMiseAJour,
  modeEdition = false,
}: {
  annonce: AnnonceEcriture;
  onPrecedent: () => void;
  onAnnonceMiseAJour: (annonce: AnnonceEcriture) => void;
  // Modification d'une annonce déjà déposée (2026-08-07) : le contenu
  // (titre/description/prix/localisation/photos) reste éditable à
  // n'importe quel statut (PATCH sans restriction, cf. annonces/api_views.py
  // AnnonceUpdateAPIView) — seul le bouton "Publier" n'a plus de sens ici,
  // le changement de statut lui-même restant gouverné par les actions
  // dédiées du dashboard (Archiver/Marquer vendue/Réactiver/Remettre en
  // vente, cf. app/compte/annonces/ListeAnnonces.tsx).
  modeEdition?: boolean;
}) {
  const router = useRouter();
  const [enCompression, setEnCompression] = useState(false);
  const [erreurUpload, setErreurUpload] = useState<string | null>(null);
  const [pendingPublication, startTransition] = useTransition();
  // Uniquement vrai juste après un appel réussi à publierAction dans CETTE
  // session (jamais dérivé de annonce.statut) — une annonce déjà en_ligne
  // ouverte en modification ne doit pas réafficher l'écran "vient d'être
  // publiée", seulement une vraie publication fraîche doit le déclencher.
  const [vientDePublier, setVientDePublier] = useState(false);
  const [raisonsBlocage, setRaisonsBlocage] = useState<string[] | null>(null);
  const [erreurPublication, setErreurPublication] = useState<string | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState<string | null>(null);
  const [erreurSuppression, setErreurSuppression] = useState<string | null>(null);
  // Suppression de photo restreinte aux brouillons côté backend (cf.
  // PhotoDeleteAPIView.perform_destroy) — pas touché ici, on se contente de
  // refléter honnêtement cette restriction plutôt que de laisser un bouton
  // actif mener à un 400 silencieux.
  const suppressionPhotoAutorisee = annonce.statut === "brouillon";

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
        setVientDePublier(true);
        router.push(`/parcelles/${resultat.annonce.slug}`);
      } else if (resultat?.fieldErrors?.statut) {
        setRaisonsBlocage(resultat.fieldErrors.statut);
      } else if (resultat?.error) {
        setErreurPublication(resultat.error);
      }
    });
  }

  if (vientDePublier) {
    return (
      <div className="akal-fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", textAlign: "center", padding: "32px 0" }}>
        <span
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            backgroundColor: "var(--color-rosee)",
            color: "var(--color-foret)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check size={26} strokeWidth={2} />
        </span>
        <h2 style={{ fontSize: 20, margin: 0 }}>Votre annonce est en ligne</h2>
        <p style={{ color: "var(--color-secondaire)", margin: 0 }}>Redirection vers votre annonce…</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>
          {modeEdition ? "Modifiez les photos" : "Ajoutez des photos"}
        </h2>
        <p style={{ fontSize: 14, color: "var(--color-secondaire)", margin: 0 }}>
          {modeEdition
            ? "Ajoutez de nouvelles photos si besoin. La suppression reste réservée aux brouillons."
            : "Au moins une photo est nécessaire pour publier votre annonce."}
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
              {suppressionPhotoAutorisee && (
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
              )}
            </div>
          ))}
        </div>
      )}
      {erreurSuppression && <p className="akal-alert-in" style={{ color: "var(--color-erreur)", fontSize: 14 }}>{erreurSuppression}</p>}

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
      {erreurUpload && <p className="akal-alert-in" style={{ color: "var(--color-erreur)", fontSize: 14 }}>{erreurUpload}</p>}

      {!modeEdition && raisonsBlocage && (
        <div className="akal-alert-in" style={{ backgroundColor: "var(--color-erreur-fond)", border: "1px solid var(--color-erreur)", borderRadius: "var(--radius-sm)", padding: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-erreur)", margin: "0 0 6px" }}>
            Impossible de publier pour le moment :
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "var(--color-texte)" }}>
            {raisonsBlocage.map((raison) => (
              <li key={raison}>{raison}</li>
            ))}
          </ul>
        </div>
      )}
      {!modeEdition && erreurPublication && (
        <p className="akal-alert-in" style={{ color: "var(--color-erreur)", fontSize: 14 }}>{erreurPublication}</p>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <button type="button" className="btn-secondary" onClick={onPrecedent}>
          Précédent
        </button>
        {modeEdition ? (
          // Le contenu est déjà enregistré à chaque étape (chaque "Continuer"
          // fait un PATCH immédiat) — ce bouton ne fait que quitter le wizard,
          // aucun changement de statut ici (cf. commentaire de tête).
          <button type="button" className="btn-primary" onClick={() => router.push("/compte/annonces")}>
            Terminer
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={gererPublication} disabled={pendingPublication}>
            {pendingPublication ? "Publication…" : "Publier l'annonce"}
          </button>
        )}
      </div>
    </div>
  );
}
