"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import imageCompression from "browser-image-compression";
import { Mail, Phone, Shield, Check } from "@/components/icons/Icons";
import { mettreAJourProfilAction } from "@/app/actions/compte";
import type { User } from "@/lib/auth-api";

// Mêmes réglages que EtapePhotosPublication.tsx (dépôt d'annonce) — même
// raison : useWebWorker:true fait tourner la compression dans un Web Worker
// qui importScripts() le code de la librairie, par défaut depuis un CDN
// externe. libURL pointe vers la copie auto-hébergée (public/vendor/) pour
// ne pas dépendre de ce CDN au moment critique de l'upload (cf. correctif
// P1 messagerie/photos du 2026-08-14). Dupliqué ici plutôt que partagé :
// même mission mais fichier/feature distincts, cf. convention déjà en place
// (ACTION_BTN_STYLE etc. redéfinis localement par écran plutôt que
// centralisés prématurément).
const OPTIONS_COMPRESSION = {
  maxSizeMB: 2,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  libURL: "/vendor/browser-image-compression.js",
};

const ligneStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--color-secondaire)" };

export default function ProfilCarte({ utilisateurInitial }: { utilisateurInitial: User }) {
  const [utilisateur, setUtilisateur] = useState(utilisateurInitial);
  const [succesRecent, setSuccesRecent] = useState<"avatar" | "telephone" | null>(null);

  const [avatarEnCours, setAvatarEnCours] = useState(false);
  const [avatarErreur, setAvatarErreur] = useState<string | null>(null);

  const [telephoneEnEdition, setTelephoneEnEdition] = useState(false);
  const [telephoneValeur, setTelephoneValeur] = useState(utilisateur.telephone ?? "");
  const [telephonePending, startTelephoneTransition] = useTransition();
  const [telephoneErreur, setTelephoneErreur] = useState<string | null>(null);

  const initiales = `${utilisateur.prenom?.[0] ?? ""}${utilisateur.nom?.[0] ?? ""}`.toUpperCase();

  // Affiché 2s puis s'efface tout seul — pas de système de toast dans ce
  // projet (audit visuel) : un signal transitoire directement à côté du
  // champ concerné suffit, plutôt qu'en inventer un pour cette seule page.
  function signalerSucces(champ: "avatar" | "telephone") {
    setSuccesRecent(champ);
    setTimeout(() => setSuccesRecent((c) => (c === champ ? null : c)), 2000);
  }

  async function gererSelectionAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = ""; // autorise de re-sélectionner le même fichier après une erreur
    if (!fichier) return;

    setAvatarErreur(null);
    setAvatarEnCours(true);
    try {
      const compresse = await imageCompression(fichier, OPTIONS_COMPRESSION);
      const formData = new FormData();
      formData.append("avatar", compresse, compresse.name);

      const resultat = await mettreAJourProfilAction(formData);
      if (resultat.ok) {
        setUtilisateur(resultat.user);
        signalerSucces("avatar");
      } else {
        setAvatarErreur(resultat.error);
      }
    } catch {
      setAvatarErreur("La compression ou l'envoi de la photo a échoué. Réessayez.");
    } finally {
      setAvatarEnCours(false);
    }
  }

  function ouvrirEditionTelephone() {
    setTelephoneErreur(null);
    setTelephoneValeur(utilisateur.telephone ?? "");
    setTelephoneEnEdition(true);
  }

  function annulerEditionTelephone() {
    setTelephoneErreur(null);
    setTelephoneEnEdition(false);
  }

  function enregistrerTelephone(e: React.FormEvent) {
    e.preventDefault();
    setTelephoneErreur(null);
    startTelephoneTransition(async () => {
      const formData = new FormData();
      formData.append("telephone", telephoneValeur.trim());

      const resultat = await mettreAJourProfilAction(formData);
      if (resultat.ok) {
        setUtilisateur(resultat.user);
        setTelephoneEnEdition(false);
        signalerSucces("telephone");
      } else {
        setTelephoneErreur(resultat.fieldErrors?.telephone?.[0] ?? resultat.error);
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div
          style={{
            position: "relative",
            width: 56,
            height: 56,
            borderRadius: "50%",
            flexShrink: 0,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--color-foret)",
            color: "white",
            fontSize: 20,
            fontWeight: 500,
          }}
        >
          {utilisateur.avatar ? (
            <Image src={utilisateur.avatar} alt="" fill sizes="56px" style={{ objectFit: "cover" }} />
          ) : (
            initiales || <Shield size={22} />
          )}
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: "var(--color-nuit)", margin: 0 }}>
            {utilisateur.prenom} {utilisateur.nom}
          </h1>
          {utilisateur.role && (
            <span
              style={{
                display: "inline-block",
                marginTop: 4,
                padding: "2px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 500,
                backgroundColor: "var(--color-rosee)",
                color: "var(--color-foret)",
              }}
            >
              {ROLE_LABELS[utilisateur.role] ?? utilisateur.role}
            </span>
          )}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {succesRecent === "avatar" && <SignalSucces />}
          <label
            className="btn-ghost"
            style={{
              fontSize: 13,
              padding: "7px 12px",
              cursor: avatarEnCours ? "wait" : "pointer",
              opacity: avatarEnCours ? 0.6 : 1,
            }}
          >
            {avatarEnCours ? "Envoi…" : utilisateur.avatar ? "Changer la photo" : "Ajouter une photo"}
            <input
              type="file"
              accept="image/*"
              onChange={gererSelectionAvatar}
              disabled={avatarEnCours}
              style={{ display: "none" }}
            />
          </label>
        </div>
      </div>
      {avatarErreur && <p className="akal-alert-in" style={{ color: "var(--color-erreur)", fontSize: 13, margin: 0 }}>{avatarErreur}</p>}

      <div style={{ height: 1, backgroundColor: "var(--color-bordure)" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={ligneStyle}>
          <Mail size={16} style={{ color: "var(--color-foret)", flexShrink: 0 }} />
          <span>{utilisateur.email}</span>
        </div>

        {!telephoneEnEdition && (
          <div style={ligneStyle}>
            <Phone size={16} style={{ color: "var(--color-foret)", flexShrink: 0 }} />
            {utilisateur.telephone ? (
              <>
                <span>{utilisateur.telephone}</span>
                {succesRecent === "telephone" && <SignalSucces />}
                <button
                  type="button"
                  onClick={ouvrirEditionTelephone}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-foret)", fontSize: 13, fontWeight: 500, padding: 0, marginLeft: 4 }}
                >
                  Modifier
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={ouvrirEditionTelephone}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-foret)", fontSize: 14, fontWeight: 500, padding: 0 }}
              >
                Ajouter un téléphone
              </button>
            )}
          </div>
        )}

        {telephoneEnEdition && (
          <form onSubmit={enregistrerTelephone} className="akal-fade-in" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="tel"
                className="input"
                value={telephoneValeur}
                onChange={(e) => setTelephoneValeur(e.target.value)}
                placeholder="+212 6 12 34 56 78"
                autoFocus
                disabled={telephonePending}
                style={{ height: 40, fontSize: 14 }}
              />
              <button type="submit" className="btn-primary" disabled={telephonePending} style={{ padding: "0 16px", fontSize: 13, whiteSpace: "nowrap" }}>
                {telephonePending ? "…" : "Enregistrer"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={telephonePending}
                onClick={annulerEditionTelephone}
                style={{ padding: "0 14px", fontSize: 13 }}
              >
                Annuler
              </button>
            </div>
            {telephoneErreur && <p className="akal-alert-in" style={{ color: "var(--color-erreur)", fontSize: 13, margin: 0 }}>{telephoneErreur}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

function SignalSucces() {
  return (
    <span className="akal-pop-in" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--color-foret)", fontSize: 12, fontWeight: 500 }}>
      <Check size={13} strokeWidth={3} />
      Enregistré
    </span>
  );
}

const ROLE_LABELS: Record<string, string> = {
  VENDEUR: "Vendeur",
  ACHETEUR: "Acheteur",
  ADMIN: "Administrateur",
};
