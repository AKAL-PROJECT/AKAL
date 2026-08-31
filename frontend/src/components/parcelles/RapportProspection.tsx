import type { Parcelle } from "@/types/parcelle";
import { formatMAD } from "@/lib/format";
import { STATUT_FONCIER_LABEL } from "./BadgeStatut";

const formatDate = new Intl.DateTimeFormat("fr-MA", { day: "numeric", month: "long", year: "numeric" });

// Rapport imprimable des parcelles suivies (P1-03) — toujours présent dans
// le DOM (nécessaire pour que window.print() le capture) mais invisible à
// l'écran, affiché uniquement à l'impression (.akal-print-uniquement,
// cf. globals.css). Volontairement sans carte : Leaflet ne s'imprime pas de
// façon fiable (tuiles chargées de façon asynchrone, mise en page écran très
// différente de la mise en page impression — cf. les déboires de
// CarteRegions.tsx plus tôt sur ce projet) ; la localisation reste donc
// textuelle (adresse approximative + région), déjà suffisante pour
// identifier chaque parcelle sur le terrain.
export function RapportProspection({ parcelles }: { parcelles: Parcelle[] }) {
  return (
    <div className="akal-print-uniquement" style={{ padding: "24px", color: "#111", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header style={{ marginBottom: "24px", borderBottom: "2px solid #2D6A4F", paddingBottom: "12px" }}>
        <div style={{ fontSize: "20px", fontWeight: 700, color: "#2D6A4F" }}>AKAL ⴰⴽⴰⵍ</div>
        <h1 style={{ fontSize: "18px", fontWeight: 500, margin: "8px 0 0" }}>Rapport de prospection</h1>
        <p style={{ fontSize: "12px", color: "#555", margin: "4px 0 0" }}>
          {parcelles.length} parcelle{parcelles.length > 1 ? "s" : ""} sélectionnée{parcelles.length > 1 ? "s" : ""} · Généré le{" "}
          {formatDate.format(new Date())}
        </p>
      </header>

      {parcelles.map((p, i) => (
        <section
          key={p.id}
          style={{
            padding: "14px 0",
            borderBottom: i < parcelles.length - 1 ? "1px solid #ddd" : "none",
            breakInside: "avoid",
          }}
        >
          <h2 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 6px" }}>{p.titre}</h2>
          <table style={{ fontSize: "13px", width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ color: "#555", padding: "2px 12px 2px 0", whiteSpace: "nowrap", verticalAlign: "top" }}>Prix</td>
                <td>{formatMAD.format(p.prix)} MAD ({formatMAD.format(p.prixM2)} MAD/m²)</td>
              </tr>
              <tr>
                <td style={{ color: "#555", padding: "2px 12px 2px 0", whiteSpace: "nowrap", verticalAlign: "top" }}>Surface</td>
                <td>{p.parcelle.surface} ha</td>
              </tr>
              <tr>
                <td style={{ color: "#555", padding: "2px 12px 2px 0", whiteSpace: "nowrap", verticalAlign: "top" }}>Localisation</td>
                <td>
                  {p.parcelle.adresseApproximative ?? p.parcelle.regionNom}
                  {p.parcelle.adresseApproximative && `, ${p.parcelle.regionNom}`}
                </td>
              </tr>
              {p.parcelle.statutFoncier && (
                <tr>
                  <td style={{ color: "#555", padding: "2px 12px 2px 0", whiteSpace: "nowrap", verticalAlign: "top" }}>Statut foncier</td>
                  <td>{STATUT_FONCIER_LABEL[p.parcelle.statutFoncier].label}</td>
                </tr>
              )}
              <tr>
                <td style={{ color: "#555", padding: "2px 12px 2px 0", whiteSpace: "nowrap", verticalAlign: "top" }}>Fiche</td>
                <td>akal.ma/parcelles/{p.slug}</td>
              </tr>
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
