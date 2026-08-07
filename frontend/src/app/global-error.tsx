"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Filet de secours de dernier recours — seulement si le LAYOUT RACINE
// lui-même plante (pas une erreur de page normale, cf. error.tsx). Next.js
// exige que ce fichier rende son propre <html>/<body> : à ce stade,
// app/layout.tsx (et donc son import de globals.css) n'est plus dans
// l'arbre rendu, d'où les couleurs de marque en dur plutôt qu'en
// var(--color-x) — ces custom properties ne seraient pas définies ici.
export default function GlobalError({
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
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Manrope, system-ui, sans-serif",
          backgroundColor: "#F8F5F0",
          color: "#1B3A2D",
        }}
      >
        <div style={{ textAlign: "center", padding: "20px", maxWidth: "360px" }}>
          <div
            style={{
              width: "88px",
              height: "88px",
              borderRadius: "50%",
              backgroundColor: "#FBEAE1",
              margin: "0 auto 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "34px",
            }}
            aria-hidden
          >
            ⚠
          </div>
          <p style={{ fontSize: "16px", fontWeight: 500, margin: "0 0 8px" }}>
            AKAL est momentanément indisponible
          </p>
          <p style={{ fontSize: "14px", color: "#555555", margin: "0 0 24px" }}>
            Le problème vient de notre côté, pas du vôtre. Réessayez dans un instant.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 500,
              color: "white",
              backgroundColor: "#2D6A4F",
              border: "none",
              borderRadius: "10px",
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
