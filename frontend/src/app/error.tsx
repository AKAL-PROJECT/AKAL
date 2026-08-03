"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { MountainEmpty } from "@/components/icons/Icons";

// Filet de secours pour toute erreur non gérée dans un Server/Client
// Component sous ce layout (hors erreurs du layout racine lui-même, cf.
// global-error.tsx). reset() retente le rendu du segment sans recharger
// toute la page — préférable à un lien "Actualiser" quand l'erreur était
// transitoire (ex. API momentanément indisponible).
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 20px 100px" }}>
      <div
        className="akal-fade-in"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "80px 20px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "104px",
            height: "104px",
            borderRadius: "50%",
            backgroundColor: "var(--color-erreur-fond)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ display: "flex", color: "var(--color-erreur)" }}>
            <MountainEmpty size={44} />
          </span>
        </div>
        <p style={{ fontSize: "16px", fontWeight: 500, color: "var(--color-texte)", margin: 0 }}>
          Une erreur est survenue
        </p>
        <p style={{ fontSize: "14px", color: "var(--color-secondaire)", margin: 0, maxWidth: "320px" }}>
          Ce n&apos;est pas grave, rien n&apos;a été perdu — vous pouvez réessayer, ou revenir à l&apos;accueil.
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/" className="btn-secondary" style={{ textDecoration: "none" }}>
            Retour à l&apos;accueil
          </Link>
          <button type="button" onClick={() => reset()} className="btn-primary">
            Réessayer
          </button>
        </div>
      </div>
    </div>
  );
}
