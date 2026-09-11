"use client";

import { useEffect, useState } from "react";
import { planifier } from "@/lib/agriscore-concurrency";
import { getPasseport, type Passeport, type PasseportIndisponibleError, type RaisonIndisponible } from "@/lib/passeport-api";

export type EtatAgriScoreResume =
  | { statut: "chargement" }
  | { statut: "ok"; passeport: Passeport }
  | { statut: "indisponible"; raison: RaisonIndisponible };

// Version compacte de la récupération du passeport, pour les usages
// catalogue/fiche/comparateur (par opposition à PasseportAgronomiqueScreen,
// qui gère la page dédiée). Deux différences volontaires :
//
//   - le fetch passe par planifier() (lib/agriscore-concurrency.ts) au lieu
//     d'un appel direct : plusieurs dizaines d'instances de ce hook peuvent
//     être montées en même temps sur une grille catalogue ;
//   - aucun retry automatique n'est exposé ici. Sur la page passeport,
//     l'utilisateur a explicitement navigué pour voir CE résultat et un
//     bouton "Réessayer" a du sens. Sur une carte compacte parmi 50, retenter
//     silencieusement à l'échelle de la grille n'apporterait rien — l'état
//     "indisponible" reste cliquable vers /passeport, qui a son propre retry.
export function useAgriScoreResume(parcelleId: string): EtatAgriScoreResume {
  const [etat, setEtat] = useState<EtatAgriScoreResume>({ statut: "chargement" });

  // Repasse à "chargement" dès que parcelleId change, sans passer par l'effet
  // ci-dessous (setState synchrone en corps d'effet déclenche un rendu en
  // cascade, interdit par react-hooks/set-state-in-effect) : setState pendant
  // le rendu lui-même est le mécanisme documenté par React pour "ajuster un
  // état quand une prop change" — React ré-exécute immédiatement le composant
  // avant de peindre, jamais de flash de l'ancien résultat. Aucun des 3
  // appelants actuels (CardParcelle, FicheParcelle, ComparateurScreen) ne
  // change réellement parcelleId après montage — défensif, pas un cas observé.
  const [idSuivi, setIdSuivi] = useState(parcelleId);
  if (parcelleId !== idSuivi) {
    setIdSuivi(parcelleId);
    setEtat({ statut: "chargement" });
  }

  useEffect(() => {
    let annule = false;

    planifier(() => getPasseport(parcelleId))
      .then((passeport) => {
        if (!annule) setEtat({ statut: "ok", passeport });
      })
      .catch((err: PasseportIndisponibleError) => {
        if (!annule) setEtat({ statut: "indisponible", raison: err?.raison ?? "erreur" });
      });

    return () => {
      annule = true;
    };
  }, [parcelleId]);

  return etat;
}
