"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stepper } from "./Stepper";
import { EtapeInfosGenerales } from "./EtapeInfosGenerales";
import { EtapeLocalisation } from "./EtapeLocalisation";
import { EtapePhotosPublication } from "./EtapePhotosPublication";
import type { AnnonceEcriture } from "@/types/depot-annonce";

const ETAPES = ["Infos générales", "Localisation", "Photos & publication"] as const;

function estGeolocalisee(annonce: AnnonceEcriture): boolean {
  return (
    annonce.parcelle.commune !== null &&
    annonce.parcelle.latitude !== null &&
    annonce.parcelle.longitude !== null
  );
}

// Reprend à la première étape incomplète plutôt que de toujours revenir à
// l'étape 1 : un brouillon avec localisation déjà renseignée n'a pas besoin
// qu'on la refasse saisir.
function etapeDeDepart(annonce: AnnonceEcriture | null): number {
  if (!annonce) return 0;
  if (!estGeolocalisee(annonce)) return 1;
  return 2;
}

export function DepotAnnonceWizard({ annonceInitiale }: { annonceInitiale: AnnonceEcriture | null }) {
  const router = useRouter();
  const [etape, setEtape] = useState(() => etapeDeDepart(annonceInitiale));
  const [annonce, setAnnonce] = useState<AnnonceEcriture | null>(annonceInitiale);

  // Pas de brouillon en localStorage (décision F03) : seule l'id transite par
  // l'URL pour permettre de reprendre après un rechargement — les données
  // elles-mêmes sont toujours relues depuis le backend (cf. app/publier/page.tsx).
  function definirAnnonce(a: AnnonceEcriture) {
    setAnnonce(a);
    router.replace(`/publier?id=${a.id}`);
  }

  return (
    <div style={{ maxWidth: 640, margin: "48px auto", padding: "0 24px 80px" }}>
      <div style={{ marginBottom: 32 }}>
        <Stepper etapes={ETAPES} etapeActive={etape} />
      </div>

      <div className="card" style={{ padding: 32 }}>
        {etape === 0 && (
          <EtapeInfosGenerales
            annonce={annonce}
            onSuivant={(a) => {
              definirAnnonce(a);
              setEtape(1);
            }}
          />
        )}
        {etape === 1 && annonce && (
          <EtapeLocalisation
            annonce={annonce}
            onPrecedent={() => setEtape(0)}
            onSuivant={(a) => {
              definirAnnonce(a);
              setEtape(2);
            }}
          />
        )}
        {etape === 2 && annonce && (
          <EtapePhotosPublication
            annonce={annonce}
            onPrecedent={() => setEtape(1)}
            onAnnonceMiseAJour={definirAnnonce}
          />
        )}
      </div>
    </div>
  );
}
