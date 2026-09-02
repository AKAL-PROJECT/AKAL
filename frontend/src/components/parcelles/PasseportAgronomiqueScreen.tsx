"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Parcelle } from "@/types/parcelle";
import { ChevronLeft, FileText, MessageSquare } from "@/components/icons/Icons";
import { STATUT_FONCIER_LABEL } from "./BadgeStatut";
import ScoreGauge from "./passeport/ScoreGauge";
import DimensionBar from "./passeport/DimensionBar";
import {
  getPasseport,
  type DimensionKey,
  type Passeport,
  type PasseportIndisponibleError,
  type RaisonIndisponible,
  DIMENSIONS,
} from "@/lib/passeport-api";
import {
  aRetenir,
  bandeScore,
  LIBELLE_DIMENSION,
  PRESENTATION_DIMENSION,
  synthese,
  verdict,
} from "@/lib/passeport-presentation";

const formatDate = new Intl.DateTimeFormat("fr-MA", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

// Carte "zone approximative" — même composant que la fiche (cercle ~500 m
// autour du point). Le passeport n'a accès à rien de plus précis que la fiche
// publique (contour réel réservé au propriétaire, cf. types/parcelle.ts).
const CarteZone = dynamic(() => import("./CarteLeafletFiche"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--color-menthe)",
        color: "var(--color-foret)",
        fontSize: "13px",
      }}
    >
      Chargement de la carte…
    </div>
  ),
});

type EtatPasseport =
  | { statut: "chargement" }
  | { statut: "ok"; passeport: Passeport }
  | { statut: "indisponible"; raison: RaisonIndisponible };

// ──────────────────────────────────────────────────────────────────────────

export default function PasseportAgronomiqueScreen({ parcelle }: { parcelle: Parcelle }) {
  const parcelleId = parcelle.parcelle.id;
  const [etat, setEtat] = useState<EtatPasseport>({ statut: "chargement" });
  const [tentative, setTentative] = useState(0);
  const [ongletActif, setOngletActif] = useState<"apercu" | DimensionKey>("apercu");

  // Le fetch est lancé une fois au montage (et re-lancé sur "Réessayer" via
  // `tentative`). setEtat n'est appelé que dans les callbacks async, jamais
  // dans le corps de l'effet.
  useEffect(() => {
    let annule = false;
    getPasseport(parcelleId)
      .then((passeport) => {
        if (!annule) setEtat({ statut: "ok", passeport });
      })
      .catch((err: PasseportIndisponibleError) => {
        if (!annule) setEtat({ statut: "indisponible", raison: err?.raison ?? "erreur" });
      });
    return () => {
      annule = true;
    };
  }, [parcelleId, tentative]);

  const reessayer = () => {
    setEtat({ statut: "chargement" });
    setTentative((n) => n + 1);
  };

  const p = parcelle.parcelle;
  const reference = p.id.slice(0, 8).toUpperCase();
  const statutFoncier = p.statutFoncier ? STATUT_FONCIER_LABEL[p.statutFoncier].label : null;

  return (
    <div style={{ maxWidth: "980px", margin: "0 auto", padding: "24px 20px 64px" }}>
      {/* Fil d'Ariane + retour — masqués à l'impression */}
      <div className="akal-print-masquer">
        <nav
          aria-label="Fil d'Ariane"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            color: "var(--color-tertiaire)",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          <Link href="/" style={{ color: "var(--color-tertiaire)", textDecoration: "none" }}>
            Accueil
          </Link>
          <span>/</span>
          <Link
            href={`/parcelles/${parcelle.slug}`}
            style={{ color: "var(--color-tertiaire)", textDecoration: "none" }}
          >
            {parcelle.titre}
          </Link>
          <span>/</span>
          <span style={{ color: "var(--color-texte)" }}>Passeport Agronomique</span>
        </nav>
        <Link
          href={`/parcelles/${parcelle.slug}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "14px",
            color: "var(--color-foret)",
            textDecoration: "none",
            marginBottom: "16px",
          }}
        >
          <ChevronLeft size={16} />
          Retour à la fiche
        </Link>
      </div>

      {/* En-tête */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "8px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--color-foret)",
            }}
          >
            Passeport Agronomique
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 500, margin: "6px 0 0" }}>{parcelle.titre}</h1>
          <p style={{ fontSize: "13px", color: "var(--color-tertiaire)", margin: "6px 0 0" }}>
            {[p.commune, p.regionNom, statutFoncier].filter(Boolean).join(" · ")}
            {" · "}
            {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
          </p>
        </div>
        <div className="akal-print-masquer" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Link
            href={`/parcelles/${parcelle.slug}`}
            className="btn-secondary akal-focusable"
            style={{ display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap", textDecoration: "none" }}
          >
            <MessageSquare size={15} />
            Contacter le vendeur
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-secondary akal-focusable"
            style={{ display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" }}
          >
            <FileText size={15} />
            Télécharger en PDF
          </button>
        </div>
      </header>

      <BadgeMode etat={etat} />

      {/* Bloc dynamique : score + dimensions + cultures */}
      <section style={{ margin: "20px 0 28px" }}>
        {etat.statut === "chargement" && <SkeletonPasseport />}
        {etat.statut === "indisponible" && <EtatIndisponible raison={etat.raison} onReessayer={reessayer} />}
        {etat.statut === "ok" && (
          <>
            {etat.passeport.avertissement && <Bandeau texte={etat.passeport.avertissement} />}
            <CarteSynthese passeport={etat.passeport} parcelle={parcelle} reference={reference} />
            <Onglets
              passeport={etat.passeport}
              actif={ongletActif}
              onChange={setOngletActif}
            />
            <ARetenir passeport={etat.passeport} />
          </>
        )}
      </section>

      {/* Identification (données réelles uniquement) */}
      <section style={{ marginBottom: "28px" }}>
        <h2 className="fiche-section-titre">Identification de la parcelle</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
          <div className="card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <LigneMeta label="Référence" valeur={reference} />
            <LigneMeta label="Région" valeur={p.regionNom} />
            <LigneMeta label="Province" valeur={p.province ?? "Non renseignée"} />
            <LigneMeta label="Commune" valeur={p.commune ?? "Non renseignée"} />
            <LigneMeta label="Superficie" valeur={`${p.surface} ha`} />
            <LigneMeta label="Statut foncier" valeur={statutFoncier ?? "Non renseigné"} />
          </div>
          <div
            style={{ height: "240px", borderRadius: "var(--radius-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}
            className="akal-print-masquer"
          >
            <CarteZone parcelle={parcelle} />
          </div>
        </div>
        <p style={{ fontSize: "12px", color: "var(--color-tertiaire)", marginTop: "10px", lineHeight: 1.6 }}>
          L&apos;analyse porte sur une zone tampon autour du point de localisation (~100–200 m), pas sur le
          contour exact de la parcelle — le contour réel reste réservé au propriétaire.
        </p>
      </section>

      {/* Limites et méthodologie */}
      <section style={{ marginBottom: "24px" }}>
        <h2 className="fiche-section-titre">Limites et méthodologie</h2>
        <div className="card" style={{ padding: "18px" }}>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "var(--color-secondaire)", lineHeight: 1.8 }}>
            <li>
              Cinq dimensions collectées auprès de sources ouvertes (SoilGrids, Open-Meteo, Sentinel-2,
              Copernicus DEM, OpenStreetMap), agrégées en un potentiel pondéré sur 100.
            </li>
            <li>
              Chaque dimension porte sa source, sa résolution et une confiance : une dimension indisponible
              sort du calcul, le score et la fiabilité portent alors sur les autres.
            </li>
            <li>Un point GPS avec zone tampon ne représente pas toute la surface d&apos;une parcelle irrégulière.</li>
            <li>
              Ces données ne remplacent pas une analyse de terrain ou de laboratoire lorsqu&apos;elle est
              nécessaire (ex. avant un investissement important).
            </li>
          </ul>
        </div>
      </section>

      {etat.statut === "ok" && (
        <p style={{ fontSize: "11px", color: "var(--color-tertiaire)", textAlign: "center" }}>
          Passeport généré le {formatDate.format(new Date(etat.passeport.genereLe))} — AKAL.
        </p>
      )}
    </div>
  );
}

// ── Badge « mode » ────────────────────────────────────────────────────────

function BadgeMode({ etat }: { etat: EtatPasseport }) {
  if (etat.statut !== "ok" || etat.passeport.mode === "reel") return null;
  return (
    <span
      style={{
        display: "inline-block",
        marginTop: "12px",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "3px 10px",
        borderRadius: "var(--radius-full)",
        backgroundColor: "var(--color-terre-fond)",
        color: "var(--color-terre-texte)",
      }}
    >
      {etat.passeport.mode === "simule" ? "Données simulées" : "Données partiellement simulées"}
    </span>
  );
}

// ── Bandeau d'avertissement ──────────────────────────────────────────────

function Bandeau({ texte }: { texte: string }) {
  return (
    <div
      role="status"
      style={{
        padding: "12px 16px",
        marginBottom: "16px",
        borderRadius: "var(--radius-md)",
        backgroundColor: "var(--color-terre-fond)",
        color: "var(--color-terre-texte)",
        fontSize: "13px",
        lineHeight: 1.5,
      }}
    >
      {texte}
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────

function SkeletonPasseport() {
  const bloc = (h: number, w: string = "100%"): React.CSSProperties => ({
    height: h,
    width: w,
    borderRadius: "var(--radius-md)",
    backgroundColor: "var(--color-menthe)",
    animation: "pulse 1.4s ease-in-out infinite",
  });
  return (
    <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }} aria-busy="true" aria-label="Analyse en cours">
      <div style={{ display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ ...bloc(120, "120px"), borderRadius: "50%" }} />
        <div style={{ flex: 1, minWidth: "220px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={bloc(18, "60%")} />
          <div style={bloc(14, "90%")} />
          <div style={bloc(14, "75%")} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={bloc(10)} />
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }`}</style>
    </div>
  );
}

// ── États d'erreur ───────────────────────────────────────────────────────

function EtatIndisponible({ raison, onReessayer }: { raison: RaisonIndisponible; onReessayer: () => void }) {
  const messages: Record<RaisonIndisponible, string> = {
    non_geolocalisee:
      "Cette parcelle n'est pas encore géolocalisée précisément — le passeport sera disponible une fois sa position confirmée.",
    introuvable: "Passeport introuvable pour cette parcelle.",
    erreur: "L'analyse est momentanément indisponible.",
  };
  return (
    <div
      className="card"
      style={{ padding: "28px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}
    >
      <p style={{ fontSize: "14px", color: "var(--color-secondaire)", maxWidth: "440px", lineHeight: 1.6, margin: 0 }}>
        {messages[raison]}
      </p>
      {raison === "erreur" && (
        <button type="button" onClick={onReessayer} className="btn-secondary akal-focusable">
          Réessayer
        </button>
      )}
    </div>
  );
}

// ── Carte synthèse ───────────────────────────────────────────────────────

const CHIP_STATUT: Record<string, { bg: string; fg: string }> = {
  compatible: { bg: "var(--color-menthe)", fg: "var(--color-foret)" },
  sous_condition: { bg: "var(--color-fond-input)", fg: "var(--color-secondaire)" },
  deconseille: { bg: "var(--color-terre-fond)", fg: "var(--color-terre-texte)" },
};

function CarteSynthese({
  passeport,
  parcelle,
  reference,
}: {
  passeport: Passeport;
  parcelle: Parcelle;
  reference: string;
}) {
  const { scoreGlobal, fiabiliteGlobale } = passeport;
  const ton = bandeScore(scoreGlobal).ton;
  const couleurVerdict =
    ton === "positif"
      ? "var(--color-foret)"
      : ton === "neutre"
        ? "var(--color-ble-texte, var(--color-secondaire))"
        : ton === "reserve"
          ? "var(--color-terre-texte)"
          : "var(--color-tertiaire)";

  return (
    <div
      className="card"
      style={{
        padding: "22px",
        marginBottom: "18px",
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "24px",
        alignItems: "start",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
        <ScoreGauge score={scoreGlobal} />
        <span style={{ fontSize: "12px", color: "var(--color-tertiaire)" }}>Fiabilité {Math.round(fiabiliteGlobale)} %</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: 0 }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: couleurVerdict }}>
          {verdict(scoreGlobal, parcelle.parcelle.accesEau)}
        </h2>
        <p style={{ fontSize: "13px", color: "var(--color-secondaire)", margin: 0, lineHeight: 1.6 }}>
          {synthese(passeport)}
        </p>

        {passeport.culturesSuggerees.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "2px" }}>
            {passeport.culturesSuggerees.map((c) => {
              const couleur = CHIP_STATUT[c.statut] ?? CHIP_STATUT.sous_condition;
              return (
                <span
                  key={c.culture}
                  title={c.raison || undefined}
                  style={{
                    fontSize: "12px",
                    padding: "3px 10px",
                    borderRadius: "var(--radius-full)",
                    backgroundColor: couleur.bg,
                    color: couleur.fg,
                    textDecoration: c.statut === "deconseille" ? "line-through" : "none",
                  }}
                >
                  {libelleCulture(c.culture)}
                  {c.statut === "sous_condition" ? " — sous condition" : ""}
                </span>
              );
            })}
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 20px",
            marginTop: "6px",
            paddingTop: "10px",
            borderTop: "1px solid var(--color-bordure)",
            fontSize: "12px",
            color: "var(--color-tertiaire)",
          }}
        >
          <span>Superficie {parcelle.parcelle.surface} ha</span>
          <span>Référence {reference}</span>
          <span>Généré le {formatDate.format(new Date(passeport.genereLe))}</span>
        </div>
      </div>
    </div>
  );
}

// ── Onglets ──────────────────────────────────────────────────────────────

function Onglets({
  passeport,
  actif,
  onChange,
}: {
  passeport: Passeport;
  actif: "apercu" | DimensionKey;
  onChange: (o: "apercu" | DimensionKey) => void;
}) {
  const onglets: { cle: "apercu" | DimensionKey; label: string }[] = [
    { cle: "apercu", label: "Aperçu" },
    ...DIMENSIONS.map((cle) => ({ cle, label: LIBELLE_DIMENSION[cle].onglet })),
  ];

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "18px" }}>
      <div
        role="tablist"
        aria-label="Dimensions du passeport"
        style={{
          display: "flex",
          overflowX: "auto",
          borderBottom: "1px solid var(--color-bordure)",
        }}
      >
        {onglets.map(({ cle, label }) => {
          const estActif = cle === actif;
          const indispo = cle !== "apercu" && passeport.dimensions[cle].statut !== "ok";
          return (
            <button
              key={cle}
              role="tab"
              type="button"
              aria-selected={estActif}
              aria-controls={`onglet-${cle}`}
              id={`tab-${cle}`}
              onClick={() => onChange(cle)}
              className="akal-focusable"
              style={{
                appearance: "none",
                background: "none",
                border: "none",
                borderBottom: `2px solid ${estActif ? "var(--color-foret)" : "transparent"}`,
                padding: "12px 16px",
                fontSize: "13px",
                fontWeight: estActif ? 600 : 400,
                color: estActif
                  ? "var(--color-foret)"
                  : indispo
                    ? "var(--color-tertiaire)"
                    : "var(--color-secondaire)",
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {label}
              {indispo ? " ·" : ""}
            </button>
          );
        })}
      </div>

      <div id={`onglet-${actif}`} role="tabpanel" aria-labelledby={`tab-${actif}`} style={{ padding: "18px" }}>
        {actif === "apercu" ? (
          <OngletApercu passeport={passeport} onChange={onChange} />
        ) : (
          <OngletDimension dimension={actif} passeport={passeport} />
        )}
      </div>
    </div>
  );
}

function OngletApercu({
  passeport,
  onChange,
}: {
  passeport: Passeport;
  onChange: (o: DimensionKey) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {DIMENSIONS.map((cle) => {
          const d = passeport.dimensions[cle];
          const indispo = d.statut !== "ok";
          const premiere = PRESENTATION_DIMENSION[cle](d.valeurs)[0];
          return (
            <DimensionBar
              key={cle}
              label={LIBELLE_DIMENSION[cle].court}
              sousScore={d.sousScore}
              valeur={premiere ? premiere.valeur : "—"}
              indisponible={indispo}
            />
          );
        })}
      </div>
      <p style={{ fontSize: "12px", color: "var(--color-tertiaire)", marginTop: "14px" }}>
        Ouvrez un onglet pour le détail d&apos;une dimension et sa traçabilité.
      </p>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
        {DIMENSIONS.map((cle) => (
          <button
            key={cle}
            type="button"
            onClick={() => onChange(cle)}
            className="akal-focusable"
            style={{
              appearance: "none",
              border: "1px solid var(--color-bordure)",
              background: "none",
              borderRadius: "var(--radius-full)",
              padding: "3px 10px",
              fontSize: "12px",
              color: "var(--color-secondaire)",
              cursor: "pointer",
            }}
          >
            {LIBELLE_DIMENSION[cle].onglet}
          </button>
        ))}
      </div>
    </div>
  );
}

function OngletDimension({ dimension, passeport }: { dimension: DimensionKey; passeport: Passeport }) {
  const d = passeport.dimensions[dimension];

  if (d.statut !== "ok") {
    return (
      <p style={{ fontSize: "14px", color: "var(--color-secondaire)", lineHeight: 1.6, margin: 0 }}>
        Dimension <strong>{LIBELLE_DIMENSION[dimension].court.toLowerCase()}</strong> indisponible pour cette
        parcelle — elle n&apos;entre pas dans le calcul du score.
      </p>
    );
  }

  const lignes = PRESENTATION_DIMENSION[dimension](d.valeurs).filter((l) => l.valeur !== "—");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <DimensionBar
        label={LIBELLE_DIMENSION[dimension].court}
        sousScore={d.sousScore}
        valeur={d.sousScore === null ? "—" : `${Math.round(d.sousScore)}/100`}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {lignes.map((l) => (
          <LigneMeta key={l.label} label={l.label} valeur={l.valeur} />
        ))}
      </div>
      <div
        style={{
          fontSize: "12px",
          color: "var(--color-tertiaire)",
          paddingTop: "10px",
          borderTop: "1px solid var(--color-bordure)",
          lineHeight: 1.7,
        }}
      >
        <div>
          Source : <strong style={{ color: "var(--color-secondaire)", fontWeight: 500 }}>{d.source}</strong>
          {d.resolutionM ? (
            <>
              {" · "}Résolution : <strong style={{ color: "var(--color-secondaire)", fontWeight: 500 }}>{d.resolutionM} m</strong>
            </>
          ) : null}
        </div>
        <div>
          Confiance : {Math.round(d.confiance * 100)} % · Collecté le{" "}
          {formatDate.format(new Date(d.dateCollecte))}
          {d.mode === "simule" ? " · valeur simulée" : ""}
        </div>
      </div>
    </div>
  );
}

// ── « À retenir » ────────────────────────────────────────────────────────

function ARetenir({ passeport }: { passeport: Passeport }) {
  const puces = aRetenir(passeport);
  return (
    <div
      className="card"
      style={{
        padding: "18px",
        borderLeft: "3px solid var(--color-foret)",
        backgroundColor: "var(--color-rosee, var(--color-fond))",
      }}
    >
      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-nuit)", marginBottom: "8px" }}>
        À retenir avant d&apos;acheter
      </div>
      <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "var(--color-secondaire)", lineHeight: 1.7 }}>
        {puces.map((puce, i) => (
          <li key={i}>{puce}</li>
        ))}
      </ul>
    </div>
  );
}

// ── Petits helpers d'affichage ───────────────────────────────────────────

function LigneMeta({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        gap: "4px 12px",
        fontSize: "13px",
      }}
    >
      <span style={{ color: "var(--color-tertiaire)" }}>{label}</span>
      <span style={{ fontWeight: 500, color: "var(--color-nuit)", textAlign: "right" }}>{valeur}</span>
    </div>
  );
}

const CULTURES_LISIBLES: Record<string, string> = {
  olivier: "Olivier",
  amandier: "Amandier",
  cereales_pluviales: "Céréales pluviales",
  maraichage_intensif: "Maraîchage intensif",
};

function libelleCulture(cle: string): string {
  return CULTURES_LISIBLES[cle] ?? cle.replace(/_/g, " ");
}
