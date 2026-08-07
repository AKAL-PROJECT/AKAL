"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stepper } from "./Stepper";
import { EtapeInfosGenerales } from "./EtapeInfosGenerales";
import { EtapeLocalisation } from "./EtapeLocalisation";
import { EtapePhotosPublication } from "./EtapePhotosPublication";
import type { AnnonceEcriture } from "@/types/depot-annonce";

const ETAPES = ["Infos générales", "Localisation", "Photos & publication"] as const;

// commune_geom (référentiel géométrique officiel, 2026-08-06) est ce qui
// alimente is_geolocated()/can_publish() côté back — pas l'ancien `commune`,
// cf. types/depot-annonce.ts.
function estGeolocalisee(annonce: AnnonceEcriture): boolean {
  return (
    annonce.parcelle.commune_geom !== null &&
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

  // Modification d'une annonce déjà déposée (2026-08-07), plutôt qu'un
  // premier dépôt — figé sur le statut D'ENTRÉE (annonceInitiale), jamais
  // recalculé sur `annonce` : une fraîche publication en cours de session
  // (statut passant de brouillon à en_ligne via l'étape 3) ne doit pas
  // basculer ce wizard en mode édition en plein milieu.
  const modeEdition = annonceInitiale !== null && annonceInitiale.statut !== "brouillon";

  // Pas de brouillon en localStorage (décision F03) : seule l'id transite par
  // l'URL pour permettre de reprendre après un rechargement — les données
  // elles-mêmes sont toujours relues depuis le backend (cf. app/publier/page.tsx).
  function definirAnnonce(a: AnnonceEcriture) {
    setAnnonce(a);
    router.replace(`/publier?id=${a.id}`);
  }

  return (
    <div style={{ maxWidth: 640, margin: "48px auto", padding: "0 24px 80px" }}>
      {/* Assistant sans titre de page jusqu'ici — chaque étape avait son
          propre h2, mais rien au niveau page (revue a11y, Phase 3). */}
      <h1 style={{ fontSize: 22, margin: "0 0 24px" }}>
        {modeEdition ? "Modifier votre annonce" : "Déposer une annonce"}
      </h1>
      <div style={{ marginBottom: 32 }}>
        <Stepper
          etapes={ETAPES}
          etapeActive={etape}
          // Navigation libre uniquement en édition — tout est déjà enregistré
          // (cf. Stepper.tsx), donc sûr d'y sauter directement, par exemple
          // pour retoucher le contour sans repasser par les infos générales.
          onEtapeClick={modeEdition ? (i) => setEtape(i) : undefined}
        />
      </div>

      <div className="card" style={{ padding: 32 }}>
        <div key={etape} className="akal-fade-in">
          {etape === 0 && (
            <EtapeInfosGenerales
              annonce={annonce}
              modeEdition={modeEdition}
              onSuivant={(a) => {
                definirAnnonce(a);
                setEtape(1);
              }}
            />
          )}
          {etape === 1 && annonce && (
            <EtapeLocalisation
              annonce={annonce}
              modeEdition={modeEdition}
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
              modeEdition={modeEdition}
              onPrecedent={() => setEtape(1)}
              onAnnonceMiseAJour={definirAnnonce}
            />
          )}
        </div>
      </div>
    </div>
  );
}
