import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-api";
import { getMesAnnonces, getMesStatistiques } from "@/lib/annonces-api";
import { FileText, Check, TrendingUp, Ruler, Grid, Heart, MessageSquare, Mail } from "@/components/icons/Icons";
import { EtatVide } from "@/components/EtatVide";
import { formatMAD } from "@/lib/format";
import type { AnnonceProprietaire } from "@/types/parcelle";
import { ListeAnnonces } from "./ListeAnnonces";

export const metadata: Metadata = {
  title: "Mes annonces • AKAL",
  description: "Gérez vos annonces publiées, en brouillon ou archivées.",
};

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
// Brouillons/archivées/vendues sont dérivés ici plutôt que par le backend :
// la liste complète est déjà chargée pour afficher le tableau ci-dessous,
// les recompter côté serveur serait un aller-retour réseau pour rien (cf.
// GET /annonces/mes-annonces/statistiques/, qui ne renvoie que ce qui n'est
// dérivable d'aucune donnée déjà en main : favoris/conversations/messages).
function calculerKpis(annonces: AnnonceProprietaire[]) {
  const enLigne = annonces.filter((a) => a.statut === "en_ligne");
  const surfaceTotale = annonces.reduce((s, a) => s + a.surface, 0);
  const valeurEnLigne = enLigne.reduce((s, a) => s + a.prix, 0);
  return {
    total: annonces.length,
    enLigne: enLigne.length,
    valeurEnLigne,
    surfaceTotale,
    brouillons: annonces.filter((a) => a.statut === "brouillon").length,
    archivees: annonces.filter((a) => a.statut === "archivee").length,
    vendues: annonces.filter((a) => a.statut === "vendue").length,
  };
}

export default async function MesAnnoncesPage() {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) redirect("/connexion?next=/compte/annonces");

  const [annonces, statistiques] = await Promise.all([getMesAnnonces(), getMesStatistiques()]);
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
          <KpiCard icon={<FileText size={17} />} label="Brouillons" valeur={String(kpis.brouillons)} />
          <KpiCard icon={<Grid size={17} />} label="Archivées" valeur={String(kpis.archivees)} />
          <KpiCard icon={<Check size={17} />} label="Vendues" valeur={String(kpis.vendues)} />
          <KpiCard icon={<Heart size={17} />} label="Favoris reçus" valeur={String(statistiques.favoris_recus)} />
          <KpiCard icon={<MessageSquare size={17} />} label="Conversations reçues" valeur={String(statistiques.conversations_recues)} />
          <KpiCard icon={<Mail size={17} />} label="Messages non lus" valeur={String(statistiques.messages_non_lus)} />
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
        <ListeAnnonces annonces={annonces} />
      )}
    </div>
  );
}
