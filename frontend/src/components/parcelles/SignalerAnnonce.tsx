"use client";

// « Signaler cette annonce » (fiche parcelle) — l'annonce entre dans la file
// de modération avec la raison choisie (backend : un signalement ouvert par
// utilisateur et par annonce, jamais par le propriétaire). Non connecté :
// renvoi vers la connexion, retour sur la fiche ensuite.
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signalerAnnonceAction } from "@/app/actions/moderation";
import { RAISONS_SIGNALEMENT } from "@/lib/moderation-motifs";
import { ModaleDecision } from "@/components/moderation/ModaleDecision";

export default function SignalerAnnonce({ annonceId, estConnecte }: { annonceId: string; estConnecte: boolean }) {
  const pathname = usePathname();
  const [ouverte, setOuverte] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const style: React.CSSProperties = {
    background: "none", border: "none", padding: 0, fontSize: 12, cursor: "pointer",
    color: "var(--color-tertiaire)", textDecoration: "underline", alignSelf: "center",
  };

  if (confirmation) {
    return <p role="status" style={{ fontSize: 12, color: "var(--color-foret)", textAlign: "center", margin: 0 }}>{confirmation}</p>;
  }
  if (!estConnecte) {
    return (
      <Link href={`/connexion?next=${encodeURIComponent(pathname)}`} style={style}>
        Signaler cette annonce
      </Link>
    );
  }

  return (
    <>
      <button type="button" className="akal-focusable" style={style} onClick={() => setOuverte(true)}>
        Signaler cette annonce
      </button>
      {ouverte && (
        <ModaleDecision
          titre="Signaler cette annonce"
          message="Votre signalement est transmis à l'équipe de modération, qui examinera l'annonce. Le vendeur ne sait pas qui l'a signalée."
          labelConfirmer="Envoyer le signalement"
          motifs={RAISONS_SIGNALEMENT}
          placeholderCommentaire="Ce qui vous semble anormal (facultatif)"
          onFermer={() => setOuverte(false)}
          onConfirmer={async (raison, commentaire) => {
            const resultat = await signalerAnnonceAction(annonceId, raison, commentaire, pathname);
            if (!resultat.ok) return resultat.error;
            setOuverte(false);
            setConfirmation(resultat.message ?? "Merci, votre signalement a été transmis.");
            return null;
          }}
        />
      )}
    </>
  );
}
