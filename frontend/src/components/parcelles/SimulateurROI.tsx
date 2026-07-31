"use client";

import { useState } from "react";

type Props = {
  prix: number;
};

// Rendement de départ neutre — l'utilisateur ajuste selon sa propre estimation ;
// on évite de suggérer un chiffre par type de culture (donnée d'opinion, pas stable).
const RENDEMENT_DEFAUT = 5;

const fmt = new Intl.NumberFormat("fr-MA");
const fmtK = (n: number) =>
  n >= 1000 ? `${fmt.format(Math.round(n / 1000))} k` : fmt.format(Math.round(n));

// ── Slider ─────────────────────────────────────────────────────────────────────

function Slider({
  label,
  valeur,
  onChange,
  min,
  max,
  step,
  affichage,
  detail,
}: {
  label: string;
  valeur: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  affichage: string;
  detail?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "13px", color: "var(--color-texte)", fontWeight: 500 }}>{label}</span>
        <strong style={{ fontSize: "15px", color: "var(--color-foret)", fontVariantNumeric: "tabular-nums" }}>
          {affichage}
        </strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--color-foret)", cursor: "pointer", margin: "2px 0" }}
      />
      {detail && (
        <span style={{ fontSize: "11px", color: "var(--color-tertiaire)" }}>{detail}</span>
      )}
    </div>
  );
}

// ── Barre de proportion ─────────────────────────────────────────────────────────

function LigneResultat({
  label,
  montant,
  signe,
  barPct,
  barColor,
}: {
  label: string;
  montant: number;
  signe?: "+" | "−";
  barPct: number;
  barColor: string;
}) {
  const couleur =
    signe === "+" ? "var(--color-foret)" : signe === "−" ? "var(--color-terre)" : "var(--color-texte)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px", padding: "10px 0", borderBottom: "1px solid var(--color-bordure)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "12px", color: "var(--color-secondaire)" }}>{label}</span>
        <span style={{ fontSize: "13px", fontWeight: 500, color: couleur, fontVariantNumeric: "tabular-nums" }}>
          {signe}{fmt.format(Math.round(montant))} MAD
        </span>
      </div>
      {barPct > 0 && (
        <div style={{ height: "4px", borderRadius: "var(--radius-full)", backgroundColor: "var(--color-fond)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.min(barPct, 100)}%`,
              borderRadius: "var(--radius-full)",
              backgroundColor: barColor,
              transition: "width 200ms ease",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Composant principal ─────────────────────────────────────────────────────────

export default function SimulateurROI({ prix }: Props) {
  const [rendement, setRendement] = useState(RENDEMENT_DEFAUT);
  const [appreciation, setAppreciation] = useState(3);
  const [duree, setDuree] = useState(7);
  const [charges, setCharges] = useState(1.5);

  const reset = () => {
    setRendement(RENDEMENT_DEFAUT);
    setAppreciation(3);
    setDuree(7);
    setCharges(1.5);
  };

  // Calculs
  const revenusAgricoles = prix * (rendement / 100) * duree;
  const plusValue = prix * (Math.pow(1 + appreciation / 100, duree) - 1);
  const chargesCumulees = prix * (charges / 100) * duree;
  const gainNet = revenusAgricoles + plusValue - chargesCumulees;
  const roi = (gainNet / prix) * 100;
  const roiAnnuel = roi / duree;
  const positif = gainNet >= 0;

  // Largeurs des barres proportionnelles au capital
  const barMax = Math.max(revenusAgricoles, plusValue, chargesCumulees, 1);
  const bar = (v: number) => (v / barMax) * 100;

  // Montants annuels pour les labels contextuels
  const revenuAnnuel = prix * (rendement / 100);
  const chargeAnnuelle = prix * (charges / 100);

  return (
    <section className="card" style={{ padding: "20px" }}>
      {/* En-tête */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "4px",
          paddingBottom: "10px",
          borderBottom: "1px solid var(--color-bordure)",
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 500, color: "var(--color-nuit)", margin: 0 }}>
          Simulateur de rentabilité
        </h2>
        <button
          type="button"
          onClick={reset}
          style={{
            fontSize: "12px",
            color: "var(--color-tertiaire)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: "var(--radius-xs)",
          }}
        >
          Réinitialiser
        </button>
      </div>

      {/* Sliders */}
      <div style={{ display: "flex", flexDirection: "column", gap: "18px", margin: "16px 0 24px" }}>
        <Slider
          label="Durée de détention"
          valeur={duree}
          onChange={setDuree}
          min={1} max={20} step={1}
          affichage={`${duree} an${duree > 1 ? "s" : ""}`}
        />
        <Slider
          label="Rendement de la culture"
          valeur={rendement}
          onChange={setRendement}
          min={0} max={15} step={0.5}
          affichage={`${rendement} %/an`}
          detail={`→ environ ${fmt.format(Math.round(revenuAnnuel))} MAD/an de revenu`}
        />
        <Slider
          label="Appréciation foncière"
          valeur={appreciation}
          onChange={setAppreciation}
          min={0} max={8} step={0.5}
          affichage={`${appreciation} %/an`}
          detail={`→ valeur du terrain ×${(Math.pow(1 + appreciation / 100, duree)).toFixed(2)} sur ${duree} ans`}
        />
        <Slider
          label="Charges annuelles"
          valeur={charges}
          onChange={setCharges}
          min={0} max={5} step={0.25}
          affichage={`${charges} %/an`}
          detail={`→ environ ${fmt.format(Math.round(chargeAnnuelle))} MAD/an (taxes, entretien…)`}
        />
      </div>

      {/* Résultats */}
      <div
        style={{
          border: "1px solid var(--color-bordure)",
          borderRadius: "var(--radius-card)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 16px",
            backgroundColor: "var(--color-fond)",
            fontSize: "12px",
            color: "var(--color-tertiaire)",
            borderBottom: "1px solid var(--color-bordure)",
          }}
        >
          Simulation sur <strong style={{ color: "var(--color-texte)" }}>{duree} ans</strong>
          {" · "}Capital : <strong style={{ color: "var(--color-texte)" }}>{fmtK(prix)} MAD</strong>
        </div>

        <div style={{ padding: "0 16px" }}>
          <LigneResultat
            label={`Revenus de la culture (${rendement}%/an × ${duree} ans)`}
            montant={revenusAgricoles}
            signe="+"
            barPct={bar(revenusAgricoles)}
            barColor="var(--color-foret)"
          />
          <LigneResultat
            label={`Plus-value foncière (${appreciation}%/an composé)`}
            montant={plusValue}
            signe="+"
            barPct={bar(plusValue)}
            barColor="var(--color-prairie)"
          />
          <LigneResultat
            label={`Charges cumulées (${charges}%/an × ${duree} ans)`}
            montant={chargesCumulees}
            signe="−"
            barPct={bar(chargesCumulees)}
            barColor="var(--color-terre)"
          />
        </div>

        {/* Bilan */}
        <div
          style={{
            backgroundColor: positif ? "var(--color-foret)" : "var(--color-terre)",
            padding: "14px 16px",
            color: "white",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: "10px", opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px" }}>
              Gain net estimé
            </div>
            <div style={{ fontSize: "20px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
              {positif ? "+" : "−"}{fmt.format(Math.round(Math.abs(gainNet)))} MAD
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "24px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
              {positif ? "+" : "−"}{Math.abs(roi).toFixed(1)} %
            </div>
            <div style={{ fontSize: "11px", opacity: 0.8 }}>
              ROI total · <strong>{positif ? "+" : "−"}{Math.abs(roiAnnuel).toFixed(1)}%/an</strong>
            </div>
          </div>
        </div>
      </div>

      <p style={{ fontSize: "11px", color: "var(--color-tertiaire)", margin: "10px 0 0", lineHeight: 1.5 }}>
        Estimation indicative. Les rendements agricoles varient selon les conditions climatiques, le
        marché et la gestion. Aucun résultat n'est garanti.
      </p>
    </section>
  );
}
