"use client";

import { useEffect, useState } from "react";
import { unstable_rethrow, usePathname } from "next/navigation";
import { getFavorisIdsAction, toggleFavoriAction } from "@/app/actions/favoris";

// Charge une fois les ids favoris de l'utilisateur courant (coût nul si non
// authentifié : getCurrentUser() court-circuite sur l'absence de cookie,
// avant tout appel réseau au backend) et expose un toggle optimiste avec
// retour arrière si l'appel serveur échoue.
export function useFavorisIds() {
  const pathname = usePathname();
  const [favorisIds, setFavorisIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let annule = false;
    getFavorisIdsAction().then((ids) => {
      if (!annule) setFavorisIds(new Set(ids));
    });
    return () => {
      annule = true;
    };
  }, []);

  const toggleFavori = async (annonceId: string) => {
    const etaitFavori = favorisIds.has(annonceId);

    setFavorisIds((s) => {
      const suivant = new Set(s);
      if (etaitFavori) suivant.delete(annonceId);
      else suivant.add(annonceId);
      return suivant;
    });

    try {
      const estFavori = await toggleFavoriAction(annonceId, pathname);
      setFavorisIds((s) => {
        const suivant = new Set(s);
        if (estFavori) suivant.add(annonceId);
        else suivant.delete(annonceId);
        return suivant;
      });
    } catch (err) {
      // toggleFavoriAction peut lancer un redirect() interne (utilisateur
      // non authentifié) : le laisser remonter à Next.js plutôt que de le
      // traiter comme une erreur applicative, sinon la redirection est
      // silencieusement avalée par le rollback ci-dessous.
      unstable_rethrow(err);
      // Retour à l'état d'avant l'appel optimiste.
      setFavorisIds((s) => {
        const suivant = new Set(s);
        if (etaitFavori) suivant.add(annonceId);
        else suivant.delete(annonceId);
        return suivant;
      });
    }
  };

  return { favorisIds, toggleFavori };
}
