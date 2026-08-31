"use client";

import { useEffect, useState } from "react";
import type { Parcelle } from "@/types/parcelle";
import {
  COMPARATEUR_MAX,
  ecrireParcellesComparees,
  lireParcellesComparees,
} from "@/components/parcelles/comparateurStorage";

// Miroir client de useFavorisIds.ts (même idée, source différente) : une
// liste partagée entre plusieurs pages sans état global dédié. Ici la
// source de vérité est sessionStorage (pas de compte requis, comparaison
// volontairement éphémère — cf. comparateurStorage.ts) plutôt que le
// serveur. Chaque montage relit sessionStorage à froid ; aucune
// synchronisation inter-instance n'est nécessaire tant que les pages qui
// l'utilisent (catalogue, favoris, fiche annonce, /comparateur) ne sont
// jamais montées deux fois simultanément — une navigation classique entre
// elles suffit à propager l'état, chaque nouveau montage repartant de l'état
// sessionStorage le plus récent.
export function useComparateur() {
  const [parcelles, setParcelles] = useState<Parcelle[]>([]);

  useEffect(() => {
    // Lecture initiale depuis sessionStorage (absent au rendu serveur), même
    // exception délibérée que ComparateurScreen.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setParcelles(lireParcellesComparees());
  }, []);

  const estEnComparaison = (id: string) => parcelles.some((p) => p.id === id);
  const estComplet = parcelles.length >= COMPARATEUR_MAX;

  const ajouter = (p: Parcelle) => {
    setParcelles((prev) => {
      if (prev.some((x) => x.id === p.id) || prev.length >= COMPARATEUR_MAX) return prev;
      const suivant = [...prev, p];
      ecrireParcellesComparees(suivant);
      return suivant;
    });
  };

  const retirer = (id: string) => {
    setParcelles((prev) => {
      const suivant = prev.filter((x) => x.id !== id);
      ecrireParcellesComparees(suivant);
      return suivant;
    });
  };

  // Bascule pratique pour une checkbox/case "Comparer" — ajoute si absente,
  // retire si déjà présente. N'ajoute pas silencieusement au-delà de
  // COMPARATEUR_MAX (ajouter() ci-dessus l'ignore déjà) : à l'appelant de
  // désactiver le contrôle via estComplet si la parcelle n'est pas déjà dedans.
  const basculer = (p: Parcelle) => {
    if (estEnComparaison(p.id)) retirer(p.id);
    else ajouter(p);
  };

  return { parcelles, ajouter, retirer, basculer, estEnComparaison, estComplet };
}
