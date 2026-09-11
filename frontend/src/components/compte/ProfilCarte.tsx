"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import imageCompression from "browser-image-compression";
import { Mail, Phone, Shield, Check, Pencil, User as UserIcon } from "@/components/icons/Icons";
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
const boutonModifierStyle: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", color: "var(--color-foret)", fontSize: 13, fontWeight: 500, padding: 0, marginLeft: 4 };

// Même famille que CardParcelle.tsx/FicheParcelle.tsx (fr-MA, mois en
// toutes lettres) — mois+année seulement ici, "membre depuis" n'a pas
// besoin du jour exact.
const formatMembreDepuis = new Intl.DateTimeFormat("fr-MA", { month: "long", year: "numeric" });

export default function ProfilCarte({
  utilisateurInitial,
  nbAnnoncesEnLigne,
}: {
  utilisateurInitial: User;
  // null = pas vendeur (panneau "Espace vendeur" absent) ; nombre réel
  // d'annonces EN_LIGNE sinon — calculé côté page.tsx (Server Component),
  // cf. commentaire là-bas.
  nbAnnoncesEnLigne: number | null;
}) {
  const [utilisateur, setUtilisateur] = useState(utilisateurInitial);
  const [succesRecent, setSuccesRecent] = useState<"avatar" | "nom" | "telephone" | null>(null);

  const [avatarEnCours, setAvatarEnCours] = useState(false);
  const [avatarErreur, setAvatarErreur] = useState<string | null>(null);

  const [nomEnEdition, setNomEnEdition] = useState(false);
  const [prenomValeur, setPrenomValeur] = useState(utilisateur.prenom ?? "");
  const [nomValeur, setNomValeur] = useState(utilisateur.nom ?? "");
  const [nomPending, startNomTransition] = useTransition();
  const [nomErreur, setNomErreur] = useState<string | null>(null);

  const [telephoneEnEdition, setTelephoneEnEdition] = useState(false);
  const [telephoneValeur, setTelephoneValeur] = useState(utilisateur.telephone ?? "");
  const [telephonePending, startTelephoneTransition] = useTransition();
  const [telephoneErreur, setTelephoneErreur] = useState<string | null>(null);

  const initiales = `${utilisateur.prenom?.[0] ?? ""}${utilisateur.nom?.[0] ?? ""}`.toUpperCase();

  // Affiché 2s puis s'efface tout seul — pas de système de toast dans ce
  // projet (audit visuel) : un signal transitoire directement à côté du
  // champ concerné suffit, plutôt qu'en inventer un pour cette seule page.
  function signalerSucces(champ: "avatar" | "nom" | "telephone") {
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

  function ouvrirEditionNom() {
    setNomErreur(null);
    setPrenomValeur(utilisateur.prenom ?? "");
    setNomValeur(utilisateur.nom ?? "");
    setNomEnEdition(true);
  }

  function annulerEditionNom() {
    setNomErreur(null);
    setNomEnEdition(false);
  }

  function enregistrerNom(e: React.FormEvent) {
    e.preventDefault();
    setNomErreur(null);
    startNomTransition(async () => {
      const formData = new FormData();
      formData.append("prenom", prenomValeur.trim());
      formData.append("nom", nomValeur.trim());

      // mettreAJourProfilAction (PATCH /auth/me/) accepte déjà prenom/nom
      // côté backend (UserUpdateSerializer) — ajouté à l'origine pour
      // ProfilCompletionGate.tsx, jamais exposé sur cet écran jusqu'ici.
      const resultat = await mettreAJourProfilAction(formData);
      if (resultat.ok) {
        setUtilisateur(resultat.user);
        setNomEnEdition(false);
        signalerSucces("nom");
      } else {
        setNomErreur(resultat.fieldErrors?.prenom?.[0] ?? resultat.fieldErrors?.nom?.[0] ?? resultat.error);
      }
    });
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
        {/* Avatar avec pastille crayon superposée (calque 2a du handoff
            design) — remplace l'ancien bouton texte "Ajouter/Changer la
            photo" : même <label>/<input type=file> caché en dessous, même
            upload/compression, seul l'habillage du déclencheur change. */}
        <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
          <div
            style={{
              position: "relative",
              width: 56,
              height: 56,
              borderRadius: "50%",
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
          <label
            aria-label={avatarEnCours ? "Envoi de la photo…" : utilisateur.avatar ? "Changer la photo de profil" : "Ajouter une photo de profil"}
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 24,
              height: 24,
              borderRadius: "50%",
              backgroundColor: "#fff",
              border: "1px solid var(--color-bordure)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: avatarEnCours ? "wait" : "pointer",
              opacity: avatarEnCours ? 0.6 : 1,
              boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
            }}
          >
            <Pencil size={12} style={{ color: "var(--color-foret)" }} />
            <input
              type="file"
              accept="image/*"
              onChange={gererSelectionAvatar}
              disabled={avatarEnCours}
              style={{ display: "none" }}
            />
          </label>
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: "var(--color-nuit)", margin: 0 }}>
            {utilisateur.prenom} {utilisateur.nom}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {utilisateur.role && (
              <span
                style={{
                  display: "inline-block",
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
            {/* date_inscription : toujours renseignée (auto_now_add côté
                modèle), déjà dans le type User mais inutilisée jusqu'ici.
                Pas de badge "Compte vérifié"/"Téléphone vérifié" à côté
                (is_verified) : ce champ n'est mis à True par aucun flux
                d'inscription/connexion réel (email, téléphone, Google) —
                seuls createsuperuser et les commandes de seed le
                renseignent. L'afficher laisserait croire à une
                vérification qui n'existe pas pour un vrai utilisateur, cf.
                docs/plans/2026-09-11-mon-profil-polish-design.md. */}
            <span style={{ fontSize: 12, color: "var(--color-tertiaire)" }}>
              Membre depuis {formatMembreDepuis.format(new Date(utilisateur.date_inscription))}
            </span>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
          {succesRecent === "avatar" && <SignalSucces />}
        </div>
      </div>
      {avatarErreur && <p className="akal-alert-in" style={{ color: "var(--color-erreur)", fontSize: 13, margin: 0 }}>{avatarErreur}</p>}

      <div style={{ height: 1, backgroundColor: "var(--color-bordure)" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--color-nuit)", margin: "0 0 10px" }}>Identité et contact</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!nomEnEdition && (
            <div style={ligneStyle}>
              <UserIcon size={16} style={{ color: "var(--color-foret)", flexShrink: 0 }} />
              <span>{utilisateur.prenom} {utilisateur.nom}</span>
              {succesRecent === "nom" && <SignalSucces />}
              <button type="button" onClick={ouvrirEditionNom} style={boutonModifierStyle}>
                Modifier
              </button>
            </div>
          )}
          {nomEnEdition && (
            <form onSubmit={enregistrerNom} className="akal-fade-in" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="text"
                  className="input"
                  value={prenomValeur}
                  onChange={(e) => setPrenomValeur(e.target.value)}
                  placeholder="Prénom"
                  autoFocus
                  disabled={nomPending}
                  style={{ height: 40, fontSize: 14, flex: 1, minWidth: 120 }}
                />
                <input
                  type="text"
                  className="input"
                  value={nomValeur}
                  onChange={(e) => setNomValeur(e.target.value)}
                  placeholder="Nom"
                  disabled={nomPending}
                  style={{ height: 40, fontSize: 14, flex: 1, minWidth: 120 }}
                />
                <button type="submit" className="btn-primary" disabled={nomPending} style={{ padding: "0 16px", fontSize: 13, whiteSpace: "nowrap" }}>
                  {nomPending ? "…" : "Enregistrer"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={nomPending}
                  onClick={annulerEditionNom}
                  style={{ padding: "0 14px", fontSize: 13 }}
                >
                  Annuler
                </button>
              </div>
              {nomErreur && <p className="akal-alert-in" style={{ color: "var(--color-erreur)", fontSize: 13, margin: 0 }}>{nomErreur}</p>}
            </form>
          )}

          {!telephoneEnEdition && (
            <div style={ligneStyle}>
              <Phone size={16} style={{ color: "var(--color-foret)", flexShrink: 0 }} />
              {utilisateur.telephone ? (
                <>
                  <span>{utilisateur.telephone}</span>
                  {succesRecent === "telephone" && <SignalSucces />}
                  <button type="button" onClick={ouvrirEditionTelephone} style={boutonModifierStyle}>
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

          <div style={ligneStyle}>
            <Mail size={16} style={{ color: "var(--color-foret)", flexShrink: 0 }} />
            <span>{utilisateur.email}</span>
          </div>
        </div>
      </div>

      {/* Panneau "Espace vendeur" (calque 2a) — role === VENDEUR uniquement
          (nbAnnoncesEnLigne vaut null sinon, cf. page.tsx). Nombre réel
          d'annonces EN_LIGNE, liens réels vers /compte/annonces et
          /publier : pas une redite de l'onglet "Mes annonces" de
          EspacePersoNav (celui-là liste le détail ; ceci est un raccourci
          contextuel depuis Mon profil), cohérent avec la décision du 20/08
          de ne pas dupliquer la navigation sur cet écran. */}
      {nbAnnoncesEnLigne !== null && (
        <div
          style={{
            backgroundColor: "var(--color-nuit)",
            borderRadius: "var(--radius-md)",
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--color-menthe)" }}>
            ESPACE VENDEUR
          </span>
          <h2 style={{ fontSize: 19, fontWeight: 500, color: "#fff", margin: 0 }}>
            {nbAnnoncesEnLigne} annonce{nbAnnoncesEnLigne !== 1 ? "s" : ""} en ligne
          </h2>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--color-menthe)" }}>
            Gérez vos annonces publiées ou déposez-en une nouvelle.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            <Link
              href="/compte/annonces"
              style={{ padding: "9px 16px", fontSize: 13.5, fontWeight: 500, color: "var(--color-nuit)", backgroundColor: "#fff", borderRadius: "var(--radius-sm)", textDecoration: "none" }}
            >
              Gérer mes annonces
            </Link>
            <Link
              href="/publier"
              style={{ padding: "9px 16px", fontSize: 13.5, fontWeight: 500, color: "#fff", backgroundColor: "rgba(255,255,255,0.12)", border: "1px solid rgba(183,215,201,0.4)", borderRadius: "var(--radius-sm)", textDecoration: "none" }}
            >
              Déposer une annonce
            </Link>
          </div>
        </div>
      )}
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
