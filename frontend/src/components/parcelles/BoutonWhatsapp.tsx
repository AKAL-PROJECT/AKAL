"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WhatsAppIcon } from "@/components/icons/Icons";
import { obtenirLienWhatsappAction } from "@/app/actions/whatsapp";

// Contact WhatsApp (hardening 2026-08-30) — le lien wa.me (qui contient le
// numéro du vendeur) n'est plus dans le DTO public : on le demande à la volée
// via une action authentifiée. `estConnecte` gate le clic côté client ;
// l'action reste une seconde barrière côté serveur.
//
// Rendu à 4 endroits de la fiche (colonne desktop + barre mobile, chacune en
// version « numéro dispo » ou « pas de numéro »), d'où l'extraction : une
// seule source pour l'état (pending/erreur) et le handler.
//   - variant="full"    : bouton pleine largeur + message sous le bouton
//   - variant="compact"  : bouton carré 44×44 (icône seule), sans message —
//                          pour la barre mobile déjà à l'étroit
export default function BoutonWhatsapp({
  disponible = false,
  annonceId,
  slug,
  estConnecte = false,
  variant = "full",
}: {
  disponible?: boolean;
  annonceId: string;
  slug: string;
  estConnecte?: boolean;
  variant?: "full" | "compact";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const handleClick = async () => {
    if (!estConnecte) {
      router.push(`/connexion?next=/parcelles/${slug}`);
      return;
    }
    setErreur(null);
    setPending(true);
    try {
      const lien = await obtenirLienWhatsappAction(annonceId, `/parcelles/${slug}`);
      if (lien) {
        window.open(lien, "_blank", "noopener,noreferrer");
      } else {
        setErreur("Le numéro WhatsApp de ce vendeur n'est pas exploitable.");
      }
    } catch {
      setErreur("Impossible d'ouvrir WhatsApp pour le moment. Réessayez.");
    } finally {
      setPending(false);
    }
  };

  // ── Version compacte (barre mobile) ────────────────────────────────────
  if (variant === "compact") {
    const communs = {
      flexShrink: 0,
      width: "44px",
      height: "44px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "var(--radius-sm)",
    } as const;
    if (!disponible) {
      return (
        <button
          type="button"
          disabled
          aria-disabled="true"
          aria-label="Contacter via WhatsApp"
          title="Ce vendeur n'a pas renseigné de numéro WhatsApp"
          className="akal-focusable"
          style={{
            ...communs,
            border: "1px solid var(--color-bordure)",
            backgroundColor: "transparent",
            color: "var(--color-tertiaire)",
            cursor: "not-allowed",
            opacity: 0.55,
          }}
        >
          <WhatsAppIcon size={20} />
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-label="Contacter via WhatsApp"
        title="Contacter via WhatsApp"
        className="akal-focusable"
        style={{
          ...communs,
          border: "none",
          backgroundColor: "#25D366",
          color: "white",
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        <WhatsAppIcon size={20} />
      </button>
    );
  }

  // ── Version pleine largeur (colonne contact desktop) ───────────────────
  if (!disponible) {
    return (
      <div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Ce vendeur n'a pas renseigné de numéro WhatsApp"
          className="akal-focusable"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "10px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-bordure)",
            backgroundColor: "transparent",
            color: "var(--color-tertiaire)",
            fontSize: "14px",
            cursor: "not-allowed",
            opacity: 0.55,
          }}
        >
          <WhatsAppIcon size={16} />
          Contacter via WhatsApp
        </button>
        <p style={{ fontSize: "12px", color: "var(--color-tertiaire)", textAlign: "center", margin: "6px 0 0" }}>
          Ce vendeur n&apos;a pas renseigné de numéro WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="akal-focusable"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          padding: "10px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid #25D366",
          backgroundColor: "#25D366",
          color: "white",
          fontSize: "14px",
          fontWeight: 500,
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.7 : 1,
          transition: "opacity 200ms ease",
        }}
      >
        <WhatsAppIcon size={16} />
        {pending ? "Ouverture…" : "Contacter via WhatsApp"}
      </button>
      {erreur && (
        <p role="alert" style={{ fontSize: "12px", color: "var(--color-terre-texte)", textAlign: "center", margin: "6px 0 0" }}>
          {erreur}
        </p>
      )}
    </div>
  );
}
