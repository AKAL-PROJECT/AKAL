"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Heart, MessageSquare, Menu, X } from "@/components/icons/Icons";
import { logoutAction } from "@/app/actions/auth";
import type { User } from "@/lib/auth-api";

export default function Navbar({ utilisateur, messagesNonLus }: { utilisateur: User | null; messagesNonLus: number }) {
  const pathname = usePathname();
  const isCatalogue = pathname.startsWith("/parcelles");
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
          className="hidden-desktop akal-fade-in"
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
          className="hidden-desktop akal-focusable"
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

      <div ref={linksRef} className="hidden-mobile" style={{ position: "relative", alignItems: "center", gap: "32px", height: "100%" }}>
        <Link
          href="/parcelles"
          ref={isCatalogue ? activeLinkRef : undefined}
          className="akal-nav-link"
          style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-texte)", textDecoration: "none", padding: "4px 0", display: "block" }}
        >
          Explorer
        </Link>
        <Link
          href="/parcelles?vue=carte"
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
        <Link href="/publier">
          <button className="btn-primary" style={{ padding: "10px 20px", fontSize: "14px" }}>
            <span className="hidden-mobile" style={{ display: "inline" }}>Déposer une annonce</span>
            <span className="hidden-desktop">Déposer</span>
          </button>
        </Link>

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
            <form action={logoutAction} className="hidden-mobile">
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
            <Link href="/compte" title={utilisateur.prenom} className="akal-icon-link akal-focusable" style={{ display: "flex", flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/uploads/icon-profil-nav.svg"
                alt="Profil"
                style={{ height: "26px", width: "26px", borderRadius: "50%", border: "1px solid var(--color-bordure)", backgroundColor: "white" }}
              />
            </Link>
          </>
        ) : (
          <Link href="/connexion" title="Profil" className="akal-icon-link akal-focusable" style={{ display: "flex", flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/uploads/icon-profil-nav.svg"
              alt="Profil"
              style={{ height: "26px", width: "26px", borderRadius: "50%", border: "1px solid var(--color-bordure)", backgroundColor: "white" }}
            />
          </Link>
        )}
      </div>

      {/* ── Menu mobile — seul point d'accès à Explorer/Carte sous 768px
          (le bloc desktop ci-dessus est en hidden-mobile). ── */}
      {menuOuvert && (
        <div
          className="hidden-desktop akal-pop-in"
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
          }}
        >
          {[
            { href: "/parcelles", label: "Explorer" },
            { href: "/parcelles?vue=carte", label: "Carte" },
            { href: "/#comment-ca-marche", label: "Comment ça marche" },
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
          {utilisateur && (
            <form action={logoutAction}>
              <button
                type="submit"
                style={{ width: "100%", textAlign: "left", padding: "12px 14px", fontSize: "15px", color: "var(--color-secondaire)", background: "none", border: "none", cursor: "pointer", borderRadius: "var(--radius-sm)" }}
              >
                Déconnexion
              </button>
            </form>
          )}
        </div>
      )}
      </nav>
    </>
  );
}
