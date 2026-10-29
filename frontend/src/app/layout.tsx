import type { Metadata } from "next";
import "./globals.css";
import SiteChrome from "@/components/SiteChrome";
import GoogleAuthProviderWrapper from "@/components/GoogleAuthProvider";
import { getCurrentUser } from "@/lib/auth-api";
import { fetchNombreMessagesNonLus } from "@/lib/messaging-api";
import { getNombreAnnoncesARevoir } from "@/lib/moderation-api";

export const metadata: Metadata = {
  title: "AKAL • ⴰⴽⴰⵍ — Plateforme foncière agricole au Maroc",
  description: "Trouvez, évaluez et investissez dans des terrains agricoles au Maroc. Scoring agronomique, carte interactive, mise en relation directe.",
  openGraph: {
    title: "AKAL • La Terre",
    description: "Marketplace de terrains agricoles au Maroc",
    locale: "fr_MA",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const utilisateur = await getCurrentUser();
  // Fetch unique par rendu (jamais de polling ici) — un échec ne doit jamais
  // faire tomber le layout racine, donc replié sur 0 silencieusement (même
  // convention que getMesStatistiques() côté dashboard propriétaire).
  // Badge modération : uniquement pour qui peut modérer (sinon 403 inutile).
  const [messagesNonLus, annoncesARevoir] = await Promise.all([
    utilisateur ? fetchNombreMessagesNonLus().catch(() => 0) : 0,
    utilisateur?.peut_moderer ? getNombreAnnoncesARevoir() : 0,
  ]);

  return (
    <html lang="fr">
      <body style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <GoogleAuthProviderWrapper>
        <SiteChrome utilisateur={utilisateur} messagesNonLus={messagesNonLus} annoncesARevoir={annoncesARevoir}>
          {children}
        </SiteChrome>
        </GoogleAuthProviderWrapper>
      </body>
    </html>
  );
}

