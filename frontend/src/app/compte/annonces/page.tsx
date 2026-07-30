import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { getMesAnnonces } from "@/lib/annonces-api";
import { archiverAnnonceAction, marquerVendueAnnonceAction, reactiverAnnonceAction } from "@/app/actions/annonces";
import BadgeStatutAnnonce from "@/components/parcelles/BadgeStatutAnnonce";
import { MountainEmpty } from "@/components/icons/Icons";

const ACTION_BTN_STYLE: React.CSSProperties = { padding: "6px 14px", fontSize: "13px", whiteSpace: "nowrap" };

export const metadata: Metadata = {
  title: "Mes annonces • AKAL",
  description: "Gérez vos annonces publiées, en brouillon ou archivées.",
};

const formatMAD = new Intl.NumberFormat("fr-MA");
const formatDate = new Intl.DateTimeFormat("fr-MA", { day: "numeric", month: "long", year: "numeric" });

export default async function MesAnnoncesPage() {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/compte/annonces");

  const annonces = await getMesAnnonces();

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 80px" }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Mes annonces</h1>

      {annonces.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            padding: "80px 20px",
            textAlign: "center",
            color: "var(--color-tertiaire)",
          }}
        >
          <MountainEmpty size={64} style={{ color: "var(--color-menthe)" }} />
          <p style={{ fontSize: "16px", fontWeight: 500, color: "var(--color-texte)", margin: 0 }}>
            Aucune annonce pour l&apos;instant
          </p>
          <Link href="/publier" className="btn-secondary" style={{ textDecoration: "none" }}>
            Déposer une annonce
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {annonces.map((a) => (
            <div
              key={a.id}
              className="card"
              style={{ display: "flex", alignItems: "center", gap: "16px", padding: "12px" }}
            >
              <div
                style={{
                  position: "relative",
                  width: "72px",
                  height: "72px",
                  flexShrink: 0,
                  borderRadius: "8px",
                  overflow: "hidden",
                  backgroundColor: "var(--color-menthe)",
                }}
              >
                {a.photoPrincipale && (
                  <Image src={a.photoPrincipale} alt={a.titre} fill sizes="72px" style={{ objectFit: "cover" }} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                <h3
                  style={{
                    fontSize: "15px",
                    fontWeight: 500,
                    color: "var(--color-texte)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.titre}
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--color-tertiaire)" }}>
                  <span>{a.surface} ha</span>
                  <span>·</span>
                  <span>Déposée le {formatDate.format(new Date(a.createdAt))}</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flexShrink: 0 }}>
                <BadgeStatutAnnonce statut={a.statut} />
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-foret)" }}>
                  {formatMAD.format(a.prix)} MAD
                </span>
              </div>

              {a.statut === "brouillon" ? (
                <Link
                  href={`/publier?id=${a.id}`}
                  className="btn-secondary"
                  style={{ flexShrink: 0, padding: "6px 14px", fontSize: "13px", textDecoration: "none" }}
                >
                  Modifier
                </Link>
              ) : (
                // Capacité backend déjà officialisée (PATCH sans restriction
                // de statut sur le contenu, P1 #4), mais /publier?id= ne sait
                // reprendre qu'un brouillon (EtapePhotosPublication affiche
                // l'écran "déjà publiée" pour une annonce en_ligne) — pas
                // d'écran d'édition pour les autres statuts pour l'instant.
                <span
                  title="Bientôt disponible"
                  style={{
                    flexShrink: 0,
                    padding: "6px 14px",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--color-tertiaire)",
                    border: "2px solid var(--color-bordure)",
                    borderRadius: "var(--radius-btn)",
                    cursor: "not-allowed",
                  }}
                >
                  Modifier
                </span>
              )}

              {(a.statut === "en_ligne" || a.statut === "archivee") && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0 }}>
                  {a.statut === "en_ligne" && (
                    <>
                      <form action={archiverAnnonceAction.bind(null, a.id)}>
                        <button type="submit" className="btn-ghost" style={ACTION_BTN_STYLE}>
                          Archiver
                        </button>
                      </form>
                      <form action={marquerVendueAnnonceAction.bind(null, a.id)}>
                        <button type="submit" className="btn-accent" style={ACTION_BTN_STYLE}>
                          Marquer vendue
                        </button>
                      </form>
                    </>
                  )}
                  {a.statut === "archivee" && (
                    <form action={reactiverAnnonceAction.bind(null, a.id)}>
                      <button type="submit" className="btn-secondary" style={ACTION_BTN_STYLE}>
                        Réactiver
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
