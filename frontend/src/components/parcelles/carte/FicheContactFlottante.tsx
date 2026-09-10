"use client";

import Image from "next/image";
import Link from "next/link";
import type { Parcelle } from "@/types/parcelle";
import { estSourceExterne, libelleSource } from "@/lib/annonce-source";
import BadgeStatut from "@/components/parcelles/BadgeStatut";
import { MessageSquare, ArrowRight } from "@/components/icons/Icons";
import { formatMAD } from "@/lib/format";

// Fiche de contact flottante de la carte plein écran (/carte — design 1c) :
// posée en bas à droite (feuille pleine largeur en bas sur mobile), elle
// reflète la parcelle sélectionnée (repère ou carte du tiroir) et rend la
// mise en relation atteignable sans quitter la carte.
//
// « Contacter » réutilise le flux existant de la fiche (deep-link `?contact=1`
// → panneau de contact / redirection connexion, cf. FicheParcelle.tsx) plutôt
// que de réimplémenter la messagerie ici. Source externe (Avito/Mubawab) :
// ni messagerie ni WhatsApp AKAL, on renvoie vers l'annonce d'origine
// (cf. lib/annonce-source.ts).
export default function FicheContactFlottante({
  parcelle: p,
  estMobile,
}: {
  parcelle: Parcelle | null;
  estMobile: boolean;
}) {
  if (!p) return null;

  const image = p.photoPrincipale ?? p.photos[0] ?? null;
  const externe = estSourceExterne(p.source);

  const conteneur: React.CSSProperties = estMobile
    ? { position: "absolute", left: "8px", right: "8px", bottom: "8px" }
    : { position: "absolute", right: "20px", bottom: "20px", width: "320px" };

  return (
    <div
      style={{
        ...conteneur,
        zIndex: 1001,
        backgroundColor: "white",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-4)",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "relative", height: estMobile ? "96px" : "130px", backgroundColor: "var(--color-menthe)" }}>
        {image && (
          <Image src={image} alt={p.titre} fill sizes={estMobile ? "100vw" : "320px"} style={{ objectFit: "cover" }} />
        )}
      </div>

      <div style={{ padding: "14px 16px 16px" }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px" }}>
          <BadgeStatut statut={p.parcelle.statutFoncier} />
        </div>

        <div style={{ fontSize: "15px", fontWeight: 600, lineHeight: 1.3, color: "var(--color-nuit)" }}>
          {p.titre}
        </div>
        <div style={{ fontSize: "13px", color: "var(--color-tertiaire)", marginTop: "3px" }}>
          {p.parcelle.regionNom} · {p.parcelle.surface} ha
        </div>
        <div
          style={{
            fontSize: "17px",
            fontWeight: 600,
            color: "var(--color-foret)",
            marginTop: "7px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatMAD.format(p.prix)} MAD
        </div>

        {externe ? (
          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--color-fond-input)" }}>
            <p style={{ margin: "0 0 8px", fontSize: "12px", lineHeight: 1.5, color: "var(--color-secondaire)" }}>
              Annonce importée depuis {libelleSource(p.source)} — le contact se fait sur la source d&apos;origine.
            </p>
            {p.sourceUrl && (
              <a
                href={p.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="akal-focusable"
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--color-foret)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                Voir l&apos;annonce d&apos;origine <ArrowRight size={13} />
              </a>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
            <Link
              href={`/parcelles/${p.slug}?contact=1`}
              className="btn-primary akal-focusable"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "10px",
                fontSize: "13.5px",
                textDecoration: "none",
              }}
            >
              <MessageSquare size={14} />
              Contacter
            </Link>
            <Link
              href={`/parcelles/${p.slug}`}
              className="btn-secondary akal-focusable"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px",
                fontSize: "13.5px",
                textDecoration: "none",
              }}
            >
              Voir la fiche
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
