"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { User } from "@/lib/auth-api";

// Routes qui gèrent leur propre habillage plein écran (pas de Navbar/Footer du site).
const CHROMELESS_ROUTES = ["/connexion", "/inscription"];

// Fil de conversation (/messages/<id>) : panneau plein écran sous la navbar
// (cf. ThreadScreen.tsx, height: calc(100vh - 64px)). Le Footer, rendu comme
// frère du wrapper de {children} plutôt que dedans, s'ajoutait après ces
// 100vh et poussait body au-delà d'un écran — scrollIntoView() scrollait
// alors toute la page au lieu du seul conteneur de messages (audit visuel,
// correctif P0.1). Uniquement le fil lui-même : /messages (liste) et
// /messages/nouveau restent des pages normales, avec Footer.
function estFilDeConversation(pathname: string) {
  return /^\/messages\/(?!nouveau$)[^/]+$/.test(pathname);
}

export default function SiteChrome({
  children,
  utilisateur,
  messagesNonLus,
}: {
  children: React.ReactNode;
  utilisateur: User | null;
  messagesNonLus: number;
}) {
  const pathname = usePathname();

  if (CHROMELESS_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar utilisateur={utilisateur} messagesNonLus={messagesNonLus} />
      <div style={{ flex: 1 }}>{children}</div>
      {!estFilDeConversation(pathname) && <Footer />}
    </>
  );
}
