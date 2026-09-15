"use client";

import { googleLogout } from "@react-oauth/google";
import { logoutAction } from "@/app/actions/auth";

// logoutAction (Server Action) blackliste le refresh token et efface les
// cookies côté backend, mais ne touche jamais à l'état Google Identity
// Services côté navigateur : GoogleOAuthProvider reste monté en continu sur
// tout le layout (cf. components/GoogleAuthProvider.tsx), donc le script GSI
// garde son état entre un logout AKAL et une nouvelle tentative. Sans ce
// nettoyage, un re-clic sur "Se connecter avec Google" peut retenter un
// auto-select silencieux au lieu de rouvrir le sélecteur de compte — et un
// échec de ce mode ne remonte pas toujours onError de façon fiable. C'est la
// cause la plus probable du bug "impossible de se reconnecter avec le même
// compte Google après une déconnexion" : ce composant remplace tous les
// `<form action={logoutAction}>` pour garantir ce nettoyage à chaque
// déconnexion, quel que soit l'endroit du site.
export default function LogoutForm({ children }: { children: React.ReactNode }) {
  return (
    <form
      action={logoutAction}
      onSubmit={() => {
        try {
          googleLogout();
        } catch {
          // best-effort : jamais bloquer la déconnexion réelle (backend)
          // pour ce nettoyage client optionnel.
        }
      }}
    >
      {children}
    </form>
  );
}
