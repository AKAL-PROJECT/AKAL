"use client";

import Link from "next/link";
import { useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import type { User } from "@/lib/auth-api";

export default function Navbar({ utilisateur }: { utilisateur: User | null }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav style={{
      position: "sticky",
      top: 0,
      zIndex: 50,
      height: "64px",
      backgroundColor: "white",
      borderBottom: "1px solid var(--color-bordure)",
      backdropFilter: "blur(8px)",
    }}>
      <div style={{
        maxWidth: "1280px",
        margin: "0 auto",
        padding: "0 24px",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>

        {/* Logo */}
        <Link href="/" style={{ textDecoration: "none", display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "20px", fontWeight: 500, color: "var(--color-foret)", lineHeight: 1 }}>
            AKAL
          </span>
          <span className="tifinagh" style={{ fontSize: "12px", color: "var(--color-tertiaire)", lineHeight: 1.2 }}>
            ⴰⴽⴰⵍ
          </span>
        </Link>

        {/* Liens desktop */}
        <div style={{ display: "flex", alignItems: "center", gap: "32px" }} className="hidden-mobile">
          <Link href="/parcelles" style={{
            fontSize: "14px",
            fontWeight: 500,
            color: "var(--color-secondaire)",
            textDecoration: "none",
          }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--color-foret)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--color-secondaire)")}
          >
            Parcelles
          </Link>
          <Link href="/carte" style={{
            fontSize: "14px",
            fontWeight: 500,
            color: "var(--color-secondaire)",
            textDecoration: "none",
          }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--color-foret)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--color-secondaire)")}
          >
            Carte
          </Link>
        </div>

        {/* CTA */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link href="/publier">
            <button className="btn-primary" style={{ padding: "8px 16px", fontSize: "13px" }}>
              Publier une annonce
            </button>
          </Link>
          {utilisateur ? (
            <>
              <Link href="/compte">
                <button className="btn-ghost" style={{ padding: "8px 16px", fontSize: "13px" }}>
                  {utilisateur.prenom}
                </button>
              </Link>
              <form action={logoutAction}>
                <button className="btn-ghost" type="submit" style={{ padding: "8px 16px", fontSize: "13px" }}>
                  Déconnexion
                </button>
              </form>
            </>
          ) : (
            <Link href="/connexion">
              <button className="btn-ghost" style={{ padding: "8px 16px", fontSize: "13px" }}>
                Connexion
              </button>
            </Link>
          )}
        </div>

      </div>
    </nav>
  );
}
