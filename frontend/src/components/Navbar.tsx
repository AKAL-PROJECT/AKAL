"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Heart, MessageSquare, Menu, User as UserIcon, X } from "@/components/icons/Icons";
import { logoutAction } from "@/app/actions/auth";
import type { User } from "@/lib/auth-api";

// Icône de profil — remplace le 2026-08-17 un SVG importé (icon-profil-nav.svg,
// silhouette auto-tracée au trait irrégulier, détonnant avec le reste du
// système d'icônes) par le même badge avatar/initiales que /compte
// (ProfilCarte.tsx) : photo réelle si présente, sinon initiales sur fond
// foret, sinon l'icône User générique de la même famille que Heart/
// MessageSquare ci-dessus. Connecté = badge plein (foret) ; non connecté =
// juste le contour, pour que l'état se lise avant même de lire le libellé.
function IconeProfil({ utilisateur }: { utilisateur: User | null }) {
  const initiales = utilisateur
    ? `${utilisateur.prenom?.[0] ?? ""}${utilisateur.nom?.[0] ?? ""}`.toUpperCase()
    : "";
  return (
    <span
      style={{
        position: "relative",
        width: "30px",
        height: "30px",
        borderRadius: "50%",
        flexShrink: 0,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: utilisateur ? "var(--color-foret)" : "transparent",
        border: utilisateur ? "none" : "1.5px solid var(--color-bordure)",
        color: utilisateur ? "white" : "var(--color-secondaire)",
        fontSize: "12px",
        fontWeight: 600,
      }}
    >
      {utilisateur?.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={utilisateur.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : initiales ? (
        initiales
      ) : (
        <UserIcon size={16} strokeWidth={1.8} />
      )}
    </span>
  );
}

export default function Navbar({ utilisateur, messagesNonLus }: { utilisateur: User | null; messagesNonLus: number }) {
  const pathname = usePathname();
  const isExplorer = pathname.startsWith("/parcelles");
  // Route dédiée (refonte nav du 19/08) — jusque-là, "Carte" menait à
  // /parcelles?vue=carte (donc isCatalogue seul suffisait, le soulignement
  // tombait toujours sous "Explorer" même en vue carte). /carte étant
  // maintenant une route à part, les deux liens ont chacun leur propre état actif.
  const isCarte = pathname.startsWith("/carte");
  const [scrolled, setScrolled] = useState(false);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });
  const [menuOuvert, setMenuOuvert] = useState(false);
  // Ferme le menu mobile à chaque changement de route sans passer par un
  // effet (pattern React officiel "ajuster un état au rendu" plutôt qu'un
  // useEffect) — la Navbar persiste entre les pages (montée une fois dans
  // SiteChrome), pas de remount naturel au changement d'URL.
  const [pathnamePrecedent, setPathnamePrecedent] = useState(pathname);
  if (pathname !== pathnamePrecedent) {
    setPathnamePrecedent(pathname);
    setMenuOuvert(false);
  }
  const linksRef = useRef<HTMLDivElement>(null);
  const activeLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const updateUnderline = () => {
      const el = activeLinkRef.current;
      const container = linksRef.current;
      if (!el || !container) {
        setUnderline({ left: 0, width: 0 });
        return;
      }
      const er = el.getBoundingClientRect();
      const cr = container.getBoundingClientRect();
      setUnderline({ left: er.left - cr.left, width: er.width });
    };
    updateUnderline();
    window.addEventListener("resize", updateUnderline);
    return () => window.removeEventListener("resize", updateUnderline);
  }, [pathname]);

  return (
    <>
      {/* Backdrop du menu mobile — même pattern que le tiroir de filtres du
          catalogue (FiltresSidebar.tsx : position fixed/inset 0, décalé de
          la hauteur de la navbar, même couleur/opacité, ferme au clic), pas
          de deuxième système inventé ici. Avant ce correctif (P1, audit
          mobile), le menu ouvert n'avait que son propre fond opaque — rien
          ne couvrait le reste du viewport, donc le contenu de la page
          restait visible et lisible derrière. Rendu en frère de <nav> (pas
          dedans) pour réutiliser tel quel le z-index 25 du pattern
          d'origine : nav (z-index 100) > ce backdrop (25) > contenu de page
          (aucun z-index, empilement normal). */}
      {menuOuvert && (
        <div
          onClick={() => setMenuOuvert(false)}
          style={{
            position: "fixed",
            inset: 0,
            top: "64px",
            backgroundColor: "rgba(17,26,21,0.4)",
            zIndex: 25,
          }}
          className="akal-nav-mobile-only akal-fade-in"
        />
      )}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 clamp(16px, 4vw, 40px)",
          backgroundColor: scrolled ? "rgba(255,255,255,0.85)" : "#FFFFFF",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          boxShadow: scrolled ? "0 1px 0 var(--color-bordure)" : "none",
          transition: "background-color 0.2s ease-out, box-shadow 0.2s ease-out",
        }}
      >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button
          type="button"
          onClick={() => setMenuOuvert((v) => !v)}
          aria-label={menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOuvert}
          className="akal-nav-mobile-only akal-focusable"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", marginLeft: "-8px", background: "none", border: "none", color: "var(--color-nuit)", cursor: "pointer" }}
        >
          {menuOuvert ? <X size={22} /> : <Menu size={22} />}
        </button>

        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/uploads/akal-logo.svg" alt="" width={32} height={32} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, gap: "2px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/uploads/akal-wordmark.svg" alt="AKAL" style={{ height: "16px", width: "auto", display: "block" }} />
            <span className="tifinagh" style={{ fontSize: "12px", color: "var(--color-tertiaire)" }}>ⴰⴽⴰⵍ</span>
          </div>
        </Link>
      </div>

      <div ref={linksRef} className="akal-nav-desktop-only" style={{ position: "relative", alignItems: "center", gap: "32px", height: "100%" }}>
        <Link
          href="/parcelles"
          ref={isExplorer ? activeLinkRef : undefined}
          className="akal-nav-link"
          style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-texte)", textDecoration: "none", padding: "4px 0", display: "block" }}
        >
          Explorer
        </Link>
        <Link
          href="/carte"
          ref={isCarte ? activeLinkRef : undefined}
          className="akal-nav-link"
          style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-texte)", textDecoration: "none", padding: "4px 0", display: "block" }}
        >
          Carte
        </Link>
        <span
          style={{
            position: "absolute",
            bottom: 0,
            height: "2px",
            background: "var(--color-prairie)",
            left: `${underline.left}px`,
            width: `${underline.width}px`,
            transition: "left 0.3s ease-out, width 0.3s ease-out",
            borderRadius: "2px",
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        {/* Toujours visible, mobile comme desktop (refonte nav du 19/08) —
            seul point d'action permanent hors tiroir sur mobile, avec le
            logo et le bouton burger. Libellé complet/court toujours sur le
            breakpoint 768px existant (.hidden-mobile/.hidden-desktop) :
            aucun souci à ce que ce texte bascule à un point différent du
            reste de la nav (1024px, cf. .akal-nav-desktop-only plus bas),
            la place ne manque pas entre les deux seuils. */}
        <Link href="/publier">
          <button className="btn-primary" style={{ padding: "10px 20px", fontSize: "14px" }}>
            <span className="hidden-mobile" style={{ display: "inline" }}>Déposer une annonce</span>
            <span className="hidden-desktop">Déposer</span>
          </button>
        </Link>

        {/* Favoris/Messages/Profil : desktop uniquement (refonte nav du
            19/08) — sur mobile, ces mêmes destinations ne vivent plus que
            dans le tiroir burger (cf. plus bas), pour ne laisser dans la
            barre que Logo + CTA + Burger, comme demandé. */}
        <div className="akal-nav-desktop-only" style={{ alignItems: "center", gap: "20px" }}>
          {/* Icône cœur conservée (le contenu principal reste vos favoris) —
              libellé élargi à "Tableau de bord" (P1-03) : la page derrière ce
              lien montre désormais aussi la carte de la sélection, l'accès au
              comparateur et l'export PDF. */}
          <Link href="/favoris" className="akal-icon-link akal-focusable" style={{ color: "var(--color-foret)", display: "flex" }} title="Tableau de bord" aria-label="Tableau de bord">
            <Heart size={24} strokeWidth={1.7} />
          </Link>
          <Link
            href="/messages"
            className="akal-icon-link akal-focusable"
            style={{ color: "var(--color-foret)", display: "flex", position: "relative" }}
            title={messagesNonLus > 0 ? `Messages (${messagesNonLus} non lu${messagesNonLus > 1 ? "s" : ""})` : "Messages"}
            aria-label={messagesNonLus > 0 ? `Messages, ${messagesNonLus} non lu${messagesNonLus > 1 ? "s" : ""}` : "Messages"}
          >
            <MessageSquare size={24} strokeWidth={1.7} />
            {messagesNonLus > 0 && (
              // Même pastille que le fil non lu dans l'inbox (InboxScreen.tsx),
              // en position absolue pour se superposer à l'icône — pas de
              // nouveau style, réutilisation du langage visuel déjà établi.
              <span
                className="akal-notify-dot"
                style={{
                  position: "absolute",
                  top: -4,
                  right: -6,
                  minWidth: 16,
                  height: 16,
                  borderRadius: "50%",
                  backgroundColor: "var(--color-terre)",
                  color: "white",
                  fontSize: 10,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 3px",
                }}
              >
                {messagesNonLus > 9 ? "9+" : messagesNonLus}
              </span>
            )}
          </Link>

          {utilisateur ? (
            <>
              <form action={logoutAction}>
                <button
                  type="submit"
                  style={{
                    fontSize: "13px",
                    color: "var(--color-secondaire)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Déconnexion
                </button>
              </form>
              <Link href="/compte" title={utilisateur.prenom} aria-label={`Profil de ${utilisateur.prenom}`} className="akal-icon-link akal-focusable" style={{ display: "flex", flexShrink: 0 }}>
                <IconeProfil utilisateur={utilisateur} />
              </Link>
            </>
          ) : (
            <Link href="/connexion" title="Connexion" aria-label="Connexion" className="akal-icon-link akal-focusable" style={{ display: "flex", flexShrink: 0 }}>
              <IconeProfil utilisateur={null} />
            </Link>
          )}
        </div>
      </div>

      {/* ── Menu mobile — seul point d'accès à Explorer/Carte/Comment ça
          marche sous 1024px (le bloc desktop ci-dessus est en
          akal-nav-desktop-only). Refonte du 19/08 (simplification nav) :
          - "Déposer une annonce" retiré de cette liste — le CTA du header
            (bouton "Déposer") reste désormais visible sur mobile aussi
            (cf. plus haut), cette entrée y devient redondante.
          - Anonyme : Explorer/Carte/Comment ça marche, puis "Se connecter"
            et "S'inscrire" séparément (routes /connexion et /inscription
            distinctes) plutôt qu'une seule entrée "Connexion" ambiguë.
          - Connecté : Tableau de bord/Mes annonces/Messages, puis Mon
            compte (avatar) en bas du tiroir juste au-dessus de Déconnexion
            — Mes annonces n'a pas d'icône dédiée dans la barre du haut,
            reste donc texte seul comme Explorer/Carte/Comment ça marche
            (même principe que le 2026-08-17 : icône uniquement sur les
            entrées qui dupliquent une icône déjà visible ailleurs). ── */}
      {menuOuvert && (
        <div
          className="akal-nav-mobile-only akal-pop-in"
          role="menu"
          style={{
            position: "absolute",
            top: "64px",
            left: 0,
            right: 0,
            backgroundColor: "white",
            borderTop: "1px solid var(--color-bordure)",
            boxShadow: "var(--shadow-2)",
            padding: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            maxHeight: "calc(100vh - 64px)",
            overflowY: "auto",
          }}
        >
          {[
            { href: "/parcelles", label: "Explorer" },
            { href: "/carte", label: "Carte" },
            { href: "/comment-ca-marche", label: "Comment ça marche" },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              role="menuitem"
              style={{ padding: "12px 14px", fontSize: "15px", fontWeight: 500, color: "var(--color-texte)", textDecoration: "none", borderRadius: "var(--radius-sm)" }}
            >
              {item.label}
            </Link>
          ))}

          <div style={{ height: "1px", backgroundColor: "var(--color-bordure)", margin: "6px 4px" }} />

          {utilisateur ? (
            <>
              <Link
                href="/favoris"
                role="menuitem"
                style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", fontSize: "15px", fontWeight: 500, color: "var(--color-texte)", textDecoration: "none", borderRadius: "var(--radius-sm)" }}
              >
                <Heart size={18} strokeWidth={1.7} style={{ color: "var(--color-foret)" }} /> Tableau de bord
              </Link>
              <Link
                href="/compte/annonces"
                role="menuitem"
                style={{ padding: "12px 14px", fontSize: "15px", fontWeight: 500, color: "var(--color-texte)", textDecoration: "none", borderRadius: "var(--radius-sm)" }}
              >
                Mes annonces
              </Link>
              <Link
                href="/messages"
                role="menuitem"
                style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", fontSize: "15px", fontWeight: 500, color: "var(--color-texte)", textDecoration: "none", borderRadius: "var(--radius-sm)" }}
              >
                <MessageSquare size={18} strokeWidth={1.7} style={{ color: "var(--color-foret)" }} />
                Messages
                {messagesNonLus > 0 && (
                  <span
                    className="akal-notify-dot"
                    style={{ minWidth: 18, height: 18, borderRadius: "50%", backgroundColor: "var(--color-terre)", color: "white", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}
                  >
                    {messagesNonLus > 9 ? "9+" : messagesNonLus}
                  </span>
                )}
              </Link>
              <Link
                href="/compte"
                role="menuitem"
                style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", fontSize: "15px", fontWeight: 500, color: "var(--color-texte)", textDecoration: "none", borderRadius: "var(--radius-sm)" }}
              >
                <IconeProfil utilisateur={utilisateur} />
                Mon compte
              </Link>

              <div style={{ height: "1px", backgroundColor: "var(--color-bordure)", margin: "6px 4px" }} />

              <form action={logoutAction}>
                <button
                  type="submit"
                  style={{ width: "100%", textAlign: "left", padding: "12px 14px", fontSize: "15px", color: "var(--color-secondaire)", background: "none", border: "none", cursor: "pointer", borderRadius: "var(--radius-sm)" }}
                >
                  Déconnexion
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/connexion"
                role="menuitem"
                style={{ padding: "12px 14px", fontSize: "15px", fontWeight: 500, color: "var(--color-texte)", textDecoration: "none", borderRadius: "var(--radius-sm)" }}
              >
                Se connecter
              </Link>
              <Link
                href="/inscription"
                role="menuitem"
                style={{ padding: "12px 14px", fontSize: "15px", fontWeight: 500, color: "var(--color-texte)", textDecoration: "none", borderRadius: "var(--radius-sm)" }}
              >
                S&apos;inscrire
              </Link>
            </>
          )}
        </div>
      )}
      </nav>
    </>
  );
}
