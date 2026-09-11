import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { getMesAnnonces } from "@/lib/annonces-api";
import { logoutAction } from "@/app/actions/auth";
import ProfilCarte from "@/components/compte/ProfilCarte";

export const metadata = { title: "Mon compte • AKAL" };

export default async function ComptePage() {
  // Ceinture et bretelles avec proxy.ts (qui ne vérifie que la présence du
  // cookie) : ici on vérifie réellement la session auprès du backend.
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/compte");

  // Panneau "Espace vendeur" (calque 2a) — nombre réel d'annonces EN_LIGNE,
  // même source que /compte/annonces (getMesAnnonces). Fetché ici (Server
  // Component) plutôt que dans ProfilCarte (client) pour rester cohérent
  // avec le reste du fichier : un seul aller-retour serveur, pas un fetch
  // client de plus. Seulement pour role === VENDEUR — même garde que
  // l'onglet "Mes annonces" d'EspacePersoNav.tsx : un acheteur qui n'a
  // jamais publié n'a rien à voir ici.
  const nbAnnoncesEnLigne = utilisateur.role === "VENDEUR"
    ? (await getMesAnnonces()).filter((a) => a.statut === "en_ligne").length
    : null;

  return (
    <div style={{ maxWidth: 640, margin: "64px auto", padding: "0 24px" }}>
      <div className="card akal-fade-in" style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Avatar + nom/prénom + téléphone : édition en place, cf.
            ProfilCarte.tsx (composant client — persistance réelle via
            PATCH /auth/me/, mission « exploiter les données déjà
            disponibles »). */}
        <ProfilCarte utilisateurInitial={utilisateur} nbAnnoncesEnLigne={nbAnnoncesEnLigne} />

        {/* "Mes recherches sauvegardées" vivait ici avant le layout de
            l'espace personnel (20/08) — retiré : a désormais son propre
            onglet dans EspacePersoNav.tsx, le répéter ici serait une
            double navigation vers la même destination. Le panneau "Espace
            vendeur" ci-dessus (ProfilCarte) fait exception : ce n'est pas
            une redite de l'onglet "Mes annonces" mais un raccourci d'accès
            depuis Mon profil, cohérent avec le calque 2a du handoff design. */}

        <form action={logoutAction}>
          <button type="submit" className="btn-ghost">Se déconnecter</button>
        </form>
      </div>
    </div>
  );
}
