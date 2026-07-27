"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { User } from "@/lib/auth-api";

// Routes qui gèrent leur propre habillage plein écran (pas de Navbar/Footer du site).
const CHROMELESS_ROUTES = ["/connexion"];

export default function SiteChrome({
  children,
  utilisateur,
}: {
  children: React.ReactNode;
  utilisateur: User | null;
}) {
  const pathname = usePathname();

  if (CHROMELESS_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar utilisateur={utilisateur} />
      <div style={{ flex: 1 }}>{children}</div>
      <Footer />
    </>
  );
}
