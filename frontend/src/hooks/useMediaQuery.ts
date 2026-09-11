"use client";

import { useEffect, useState } from "react";

// Écoute une media query côté client. Renvoie `false` au premier rendu (SSR
// + montage) puis se met à jour — un composant qui l'utilise doit donc
// rester correct dans les deux états (ajuster une mise en page, jamais la
// faire « sauter »). Pensé pour les cas où `.hidden-mobile`/`.hidden-desktop`
// (globals.css) ne suffisent pas : quand le JS lui-même doit se comporter
// différemment (ex. tiroir replié par défaut sur mobile, cf. /carte).
export function useMediaQuery(query: string): boolean {
  const [correspond, setCorrespond] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const maj = () => setCorrespond(mql.matches);
    maj();
    mql.addEventListener("change", maj);
    return () => mql.removeEventListener("change", maj);
  }, [query]);

  return correspond;
}
