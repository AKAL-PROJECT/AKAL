import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { getMesAnnonces } from "@/lib/annonces-api";
import { archiverAnnonceAction, marquerVendueAnnonceAction, reactiverAnnonceAction } from "@/app/actions/annonces";
import BadgeStatutAnnonce from "@/components/parcelles/BadgeStatutAnnonce";
import { FileText, Check, TrendingUp, Ruler } from "@/components/icons/Icons";
import { EtatVide } from "@/components/EtatVide";
import type { AnnonceProprietaire } from "@/types/parcelle";
import BoutonAvecConfirmation from "./BoutonAvecConfirmation";

const ACTION_BTN_STYLE: React.CSSProperties = { padding: "6px 14px", fontSize: "13px", whiteSpace: "nowrap" };

export const metadata: Metadata = {
  title: "Mes annonces • AKAL",
  description: "Gérez vos annonces publiées, en brouillon ou archivées.",
};

const formatMAD = new Intl.NumberFormat("fr-MA");
const formatDate = new Intl.DateTimeFormat("fr-MA", { day: "numeric", month: "long", year: "numeric" });

function KpiCard({ icon, label, valeur }: { icon: React.ReactNode; label: string; valeur: string }) {
  return (
    <div className="card" style={{ padding: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
      <span
        style={{
          flexShrink: 0,
          width: "38px",
          height: "38px",
          borderRadius: "var(--radius-sm)",
          backgroundColor: "var(--color-rosee)",
          color: "var(--color-foret)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "19px", fontWeight: 600, color: "var(--color-nuit)", fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>
          {valeur}
        </div>
        <div style={{ fontSize: "12px", color: "var(--color-tertiaire)" }}>{label}</div>
      </div>
    </div>
  );
}

// Agrégats calculés à partir des annonces réellement chargées (aucune
// statistique inventée : pas de vues/contacts, l'API ne les expose pas).
function calculerKpis(annonces: AnnonceProprietaire[]) {
  const enLigne = annonces.filter((a) => a.statut === "en_ligne");
  const surfaceTotale = annonces.reduce((s, a) => s + a.surface, 0);
  const valeurEnLigne = enLigne.reduce((s, a) => s + a.prix, 0);
  return {
    total: annonces.length,
    enLigne: enLigne.length,
    valeurEnLigne,
    surfaceTotale,
  };
}

export default async function MesAnnoncesPage() {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/compte/annonces");

  const annonces = await getMesAnnonces();
  const kpis = calculerKpis(annonces);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px 80px" }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Mes annonces</h1>
      <p style={{ fontSize: 14, color: "var(--color-secondaire)", margin: "0 0 24px" }}>
        {utilisateur.prenom}, voici l&apos;état de votre portefeuille de parcelles.
      </p>

      {annonces.length > 0 && (
        <div
          className="akal-fade-in"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "28px" }}
        >
          <KpiCard icon={<FileText size={17} />} label="Annonces au total" valeur={String(kpis.total)} />
          <KpiCard icon={<Check size={17} />} label="En ligne" valeur={String(kpis.enLigne)} />
          <KpiCard icon={<TrendingUp size={17} />} label="Valeur en ligne" valeur={`${formatMAD.format(kpis.valeurEnLigne)} MAD`} />
          <KpiCard icon={<Ruler size={17} />} label="Surface totale" valeur={`${kpis.surfaceTotale.toLocaleString("fr-MA")} ha`} />
        </div>
      )}

      {annonces.length === 0 ? (
        <EtatVide
          titre="Aucune annonce pour l'instant"
          action={
            <Link href="/publier" className="btn-secondary" style={{ textDecoration: "none" }}>
              Déposer une annonce
            </Link>
          }
        />
      ) : (
        <div className="akal-stagger" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {annonces.map((a) => (
            <div
              key={a.id}
              className="card"
              style={{ display: "flex", alignItems: "center", gap: "16px", padding: "12px", flexWrap: "wrap" }}
            >
              <div
                style={{
                  position: "relative",
                  width: "72px",
                  height: "72px",
                  flexShrink: 0,
                  borderRadius: "var(--radius-sm)",
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
                      <BoutonAvecConfirmation
                        action={archiverAnnonceAction.bind(null, a.id)}
                        label="Archiver"
                        className="btn-ghost"
                        confirmMessage={`Archiver « ${a.titre} » ? Elle ne sera plus visible dans le catalogue public. Vous pourrez la réactiver plus tard.`}
                      />
                      <BoutonAvecConfirmation
                        action={marquerVendueAnnonceAction.bind(null, a.id)}
                        label="Marquer vendue"
                        className="btn-accent"
                        confirmMessage={`Marquer « ${a.titre} » comme vendue ? Cette action est définitive : il ne sera plus possible de la remettre en ligne.`}
                      />
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
