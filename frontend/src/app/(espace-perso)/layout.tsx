import { getCurrentUser } from "@/lib/auth-api";
import { EspacePersoNav } from "./EspacePersoNav";

// Layout partagé de l'espace personnel connecté (20/08) — regroupe
// /favoris, /compte, /compte/annonces et /compte/recherches sous une même
// navigation (onglet "Tableau de bord"/"Mes annonces"/"Mes recherches"/
// "Mon profil"), cf. EspacePersoNav.tsx.
//
// Route group : (espace-perso) n'apparaît jamais dans l'URL — /favoris et
// /compte gardent exactement leurs adresses actuelles. Délibéré : les
// renommer sous /dashboard/... casserait les liens déjà posés partout
// (Navbar.tsx, redirections `?next=`, proxy.ts::ROUTES_PROTEGEES) pour un
// gain cosmétique, à quelques jours d'une démo jury.
//
// Pas de garde `if (!utilisateur) redirect(...)` ici — chaque page enfant
// garde la sienne (avec son propre `next=` précis, cf. favoris/page.tsx et
// consorts). Si utilisateur est null, on rend les enfants tels quels et
// c'est leur redirect() qui s'exécute, plutôt que de dupliquer la garde ici
// avec un `next=` générique qui romprait le retour à la bonne page après
// connexion.
export default async function EspacePersoLayout({ children }: { children: React.ReactNode }) {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) return <>{children}</>;

  return (
    <div className="espace-perso-layout">
      <EspacePersoNav utilisateur={utilisateur} />
      <div className="espace-perso-contenu">{children}</div>
    </div>
  );
}
