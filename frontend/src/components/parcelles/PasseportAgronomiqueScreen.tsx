"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Parcelle } from "@/types/parcelle";
import { ChevronLeft, Droplets, FileText, Leaf, Ruler, MapPin } from "@/components/icons/Icons";
import ScoreBar from "./ScoreBar";
import {
  CONFIANCE_LABEL,
  type NiveauConfiance,
  type PasseportAgronomique,
} from "@/data/passeportAgronomique";

const formatDate = new Intl.DateTimeFormat("fr-MA", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

function formatDistance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}

// Carte "zone approximative" — même composant que la fiche (cercle ~500 m
// autour du point, jamais un marqueur exact) : le Passeport Agronomique n'a
// accès à rien de plus précis que la fiche publique elle-même (le contour
// réel, s'il existe, reste réservé au propriétaire — cf. types/parcelle.ts).
const CarteZone = dynamic(() => import("./CarteLeafletFiche"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--color-menthe)", color: "var(--color-foret)", fontSize: "13px" }}>
      Chargement de la carte…
    </div>
  ),
});

const BADGE_CONFIANCE_COULEUR: Record<NiveauConfiance, { bg: string; texte: string }> = {
  elevee: { bg: "var(--color-info-fond)", texte: "var(--color-info)" },
  moyenne: { bg: "var(--color-fond-input)", texte: "var(--color-secondaire)" },
  faible: { bg: "var(--color-terre-fond)", texte: "var(--color-terre-texte)" },
};

function BadgeConfiance({ niveau }: { niveau: NiveauConfiance }) {
  const c = BADGE_CONFIANCE_COULEUR[niveau];
  return (
    <span style={{ fontSize: "11px", fontWeight: 500, padding: "2px 8px", borderRadius: "var(--radius-full)", backgroundColor: c.bg, color: c.texte, whiteSpace: "nowrap" }}>
      Confiance simulée : {CONFIANCE_LABEL[niveau]}
    </span>
  );
}

function BadgePrototype() {
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "3px 10px",
        borderRadius: "var(--radius-full)",
        backgroundColor: "var(--color-terre-fond)",
        color: "var(--color-terre-texte)",
        whiteSpace: "nowrap",
      }}
    >
      Prototype — données simulées
    </span>
  );
}

function CarteAgent({
  accent,
  icone,
  titre,
  source,
  resolution,
  confiance,
  limitation,
  children,
}: {
  accent: string;
  icone: ReactNode;
  titre: string;
  source: string;
  resolution: string | null;
  confiance: NiveauConfiance;
  limitation: string;
  children: ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", breakInside: "avoid" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 18px", borderBottom: `2px solid ${accent}`, backgroundColor: "var(--color-fond)" }}>
        {icone ? (
          <span style={{ color: accent, display: "flex" }}>{icone}</span>
        ) : (
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: accent, flexShrink: 0 }} />
        )}
        <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-texte)", flex: 1 }}>{titre}</span>
        <BadgeConfiance niveau={confiance} />
      </div>

      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {children}

        <div style={{ fontSize: "12px", color: "var(--color-tertiaire)", paddingTop: "10px", borderTop: "1px solid var(--color-bordure)" }}>
          <div>
            Source théorique : <strong style={{ color: "var(--color-secondaire)", fontWeight: 500 }}>{source}</strong>
            {resolution && <> · Résolution théorique : <strong style={{ color: "var(--color-secondaire)", fontWeight: 500 }}>{resolution}</strong></>}
          </div>
          <div style={{ marginTop: "4px" }}>{limitation}</div>
        </div>
      </div>
    </div>
  );
}

function Valeur({ label, valeur }: { label: string; valeur: string }) {
  return (
    // flexWrap + gap : une valeur longue (ex. saisonnalité NDVI) passe à la
    // ligne sous son libellé sur mobile plutôt que de le coller sans espace
    // (space-between seul ne réserve aucun espacement minimal entre les deux).
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "4px 12px", fontSize: "13px" }}>
      <span style={{ color: "var(--color-tertiaire)" }}>{label}</span>
      <span style={{ fontWeight: 500, color: "var(--color-nuit)", textAlign: "right" }}>{valeur}</span>
    </div>
  );
}

export default function PasseportAgronomiqueScreen({
  parcelle,
  passeport,
}: {
  // Uniquement pour CarteLeafletFiche (attend une Parcelle complète) et le
  // slug du lien retour — passeport.identification porte déjà toutes les
  // valeurs affichées ici, jamais relues depuis `parcelle` directement.
  parcelle: Parcelle;
  passeport: PasseportAgronomique;
}) {
  const slug = parcelle.slug;
  const { identification: id, sol, climat, ndvi, topographie, accessibilite, profil } = passeport;

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px 20px 64px" }}>
      {/* Fil d'Ariane + retour — masqués à l'impression (akal-print-masquer,
          cf. globals.css) : sans objet sur un PDF exporté. */}
      <div className="akal-print-masquer">
        <nav aria-label="Fil d'Ariane" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--color-tertiaire)", marginBottom: "16px", flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "var(--color-tertiaire)", textDecoration: "none" }}>Accueil</Link>
          <span>/</span>
          <Link href={`/parcelles/${slug}`} style={{ color: "var(--color-tertiaire)", textDecoration: "none" }}>{id.titre}</Link>
          <span>/</span>
          <span style={{ color: "var(--color-texte)" }}>Passeport Agronomique</span>
        </nav>
        <Link href={`/parcelles/${slug}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "var(--color-foret)", textDecoration: "none", marginBottom: "16px" }}>
          <ChevronLeft size={16} />
          Retour à la fiche
        </Link>
      </div>

      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "8px" }}>
        <div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-foret)", letterSpacing: "0.02em" }}>AKAL ⴰⴽⴰⵍ</div>
          <h1 style={{ fontSize: "24px", fontWeight: 500, margin: "6px 0 0" }}>Passeport Agronomique</h1>
          <p style={{ fontSize: "14px", color: "var(--color-secondaire)", margin: "4px 0 0" }}>{id.titre}</p>
        </div>
        <div className="akal-print-masquer">
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
      </div>

      <div style={{ margin: "12px 0 24px" }}>
        <BadgePrototype />
      </div>

      {/* Identification (données réelles uniquement) */}
      <section style={{ marginBottom: "28px" }}>
        <h2 className="fiche-section-titre">Identification de la parcelle</h2>
        {/* auto-fit/minmax plutôt que 2 colonnes fixes : passe seule en
            colonne sur mobile sans media query, même idiome que la grille
            catalogue (GRILLE_STYLE, app/parcelles/page.tsx) — deux colonnes
            fixes ("minmax(0,1fr) minmax(220px,300px)") faisaient déborder
            la carte sur le texte en dessous de ~390px. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
          <div className="card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <Valeur label="Référence" valeur={id.reference} />
            <Valeur label="Région" valeur={id.region} />
            <Valeur label="Province" valeur={id.province ?? "Non renseignée"} />
            <Valeur label="Commune" valeur={id.commune ?? "Non renseignée"} />
            <Valeur label="Superficie" valeur={`${id.surfaceHa} ha`} />
            <Valeur label="Coordonnées" valeur={`${id.latitude.toFixed(4)}, ${id.longitude.toFixed(4)}`} />
          </div>
          {/* akal-print-masquer : Leaflet ne s'imprime pas de façon fiable
              (cf. data/passeportAgronomique.ts) — le texte sous la carte
              suffit seul à l'impression. 240px plutôt que les 320px de
              CarteLeafletFiche sur la fiche : laisse quand même assez de
              place à sa bannière de confidentialité (~70px) sans écraser le
              cercle de zone approximative. */}
          <div style={{ height: "240px", borderRadius: "var(--radius-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }} className="akal-print-masquer">
            <CarteZone parcelle={parcelle} />
          </div>
        </div>
        <p style={{ fontSize: "12px", color: "var(--color-tertiaire)", marginTop: "10px", lineHeight: 1.6 }}>
          {id.contour
            ? "Analyse basée sur le contour réel de la parcelle."
            : "Analyse basée sur une zone approximative (~100–200 m) autour du point de localisation — pas encore sur le contour exact de la parcelle."}
        </p>
      </section>

      {/* Synthèse */}
      <section style={{ marginBottom: "28px" }}>
        <h2 className="fiche-section-titre">Synthèse</h2>
        <div className="card" style={{ padding: "18px" }}>
          <ScoreBar score={profil.scoreGlobal} />
          <p style={{ fontSize: "13px", color: "var(--color-secondaire)", margin: "10px 0 0" }}>
            Profil de démonstration « {profil.nom} » — potentiel global{" "}
            {profil.niveauGlobal === "eleve" ? "élevé" : profil.niveauGlobal === "moyen" ? "moyen" : "faible"} (simulation).
          </p>
        </div>
      </section>

      {/* 5 agents */}
      <section style={{ marginBottom: "28px" }}>
        <h2 className="fiche-section-titre">Les 5 dimensions analysées</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <CarteAgent accent="var(--color-terre)" icone={null} titre="Agent Sol" source={sol.source} resolution={sol.resolution} confiance={sol.confiance} limitation={sol.limitation}>
            <Valeur label="Type de sol" valeur={sol.valeurs.typeSol} />
            <Valeur label="pH estimé" valeur={sol.valeurs.ph.toFixed(1)} />
            <Valeur label="Aptitude" valeur={sol.valeurs.aptitude} />
          </CarteAgent>

          <CarteAgent accent="var(--color-info)" icone={<Droplets size={16} />} titre="Agent Climat" source={climat.source} resolution={climat.resolution} confiance={climat.confiance} limitation={climat.limitation}>
            <Valeur label="Température moyenne" valeur={`${climat.valeurs.temperatureMoyenneC} °C`} />
            <Valeur label="Précipitations annuelles" valeur={`${climat.valeurs.precipitationsAnnuellesMm} mm/an`} />
            <Valeur label="Période analysée" valeur={climat.periode} />
          </CarteAgent>

          <CarteAgent accent="var(--color-foret)" icone={<Leaf size={16} />} titre="Agent NDVI / Végétation" source={ndvi.source} resolution={ndvi.resolution} confiance={ndvi.confiance} limitation={ndvi.limitation}>
            <Valeur label="NDVI moyen" valeur={`${ndvi.valeurs.moyenne.toFixed(2)} / 1`} />
            <Valeur label="Saisonnalité" valeur={ndvi.valeurs.saisonnalite} />
            <Valeur label="Période" valeur={ndvi.periode} />
          </CarteAgent>

          <CarteAgent accent="var(--color-argile)" icone={<Ruler size={16} />} titre="Agent Topographie" source={topographie.source} resolution={topographie.resolution} confiance={topographie.confiance} limitation={topographie.limitation}>
            <Valeur label="Altitude" valeur={`${topographie.valeurs.altitudeM} m`} />
            <Valeur label="Pente" valeur={`${topographie.valeurs.pentePourcent} %`} />
          </CarteAgent>

          <CarteAgent accent="var(--color-ble)" icone={<MapPin size={16} />} titre="Agent Accessibilité" source={accessibilite.source} resolution={accessibilite.resolution} confiance={accessibilite.confiance} limitation={accessibilite.limitation}>
            <Valeur label="Distance à la route (vol d'oiseau)" valeur={formatDistance(accessibilite.valeurs.distanceRouteM)} />
            <Valeur label="Distance à une localité (vol d'oiseau)" valeur={`${accessibilite.valeurs.distanceLocaliteKm.toFixed(1)} km`} />
          </CarteAgent>
        </div>
      </section>

      {/* Limites et méthodologie */}
      <section style={{ marginBottom: "24px" }}>
        <h2 className="fiche-section-titre">Limites et méthodologie</h2>
        <div className="card" style={{ padding: "18px" }}>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "var(--color-secondaire)", lineHeight: 1.8 }}>
            <li>Toutes les valeurs de ce rapport sont <strong>simulées</strong> — ce prototype démontre le futur format du Passeport Agronomique, il n&apos;interroge aucune source scientifique réelle.</li>
            <li>Les futures données réelles (SoilGrids, Open-Meteo, Sentinel-2, Copernicus DEM, OpenStreetMap) auront des résolutions et des méthodes de collecte différentes de cette simulation.</li>
            <li>Un point GPS avec zone tampon ne représente pas nécessairement toute la surface d&apos;une parcelle irrégulière.</li>
            <li>Le contour réel de la parcelle, quand il sera exploitable dans ce rapport, permettra une analyse plus précise.</li>
            <li>Ces données, même réelles, ne remplaceront jamais une analyse de terrain ou de laboratoire lorsqu&apos;elle est nécessaire (ex. avant un investissement important).</li>
          </ul>
        </div>
      </section>

      <p style={{ fontSize: "11px", color: "var(--color-tertiaire)", textAlign: "center" }}>
        Rapport de démonstration généré le {formatDate.format(new Date(passeport.genereLe))} — AKAL, Prototype Passeport Agronomique.
      </p>
    </div>
  );
}
