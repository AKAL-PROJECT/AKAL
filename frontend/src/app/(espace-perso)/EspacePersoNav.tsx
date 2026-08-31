"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, FileText, Bell, User } from "@/components/icons/Icons";
import type { User as Utilisateur } from "@/lib/auth-api";

// Onglets de l'espace personnel (20/08) — regroupe des pages qui vivaient
// jusqu'ici sans navigation commune entre elles (cf. layout.tsx). "Mes
// annonces" réservé aux comptes qui ont déjà publié (role passe à VENDEUR
// au premier dépôt, cf. AnnonceListCreateAPIView.perform_create) — jamais
// un mode exclusif basculable : un acheteur garde ses recherches
// sauvegardées même s'il devient aussi vendeur, et inversement.
const ONGLETS = [
  { href: "/favoris", label: "Tableau de bord", icon: Heart },
  { href: "/compte/annonces", label: "Mes annonces", icon: FileText, vendeurSeulement: true },
  { href: "/compte/recherches", label: "Mes recherches", icon: Bell },
  { href: "/compte", label: "Mon profil", icon: User },
] as const;

export function EspacePersoNav({ utilisateur }: { utilisateur: Utilisateur }) {
  const pathname = usePathname();
  const onglets = ONGLETS.filter((o) => !("vendeurSeulement" in o) || utilisateur.role === "VENDEUR");

  return (
    <nav aria-label="Espace personnel" className="espace-perso-nav">
      {onglets.map(({ href, label, icon: Icon }) => {
        // /compte est aussi le préfixe de /compte/annonces et
        // /compte/recherches : correspondance exacte pour cette seule
        // entrée, sinon "Mon profil" resterait actif sur les deux autres.
        const actif = href === "/compte" ? pathname === "/compte" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={actif ? "page" : undefined}
            className={`espace-perso-onglet akal-focusable${actif ? " espace-perso-onglet-actif" : ""}`}
          >
            <Icon size={17} strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
