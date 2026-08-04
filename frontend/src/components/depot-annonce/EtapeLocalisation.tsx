"use client";

import { useActionState, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { enregistrerLocalisationAction, type DepotFormState } from "@/app/actions/depot-annonce";
import { fetchCommunes, fetchProvinces, fetchRegions } from "@/lib/geo-api";
import type { AnnonceEcriture, CommuneRef, ProvinceRef, RegionRef } from "@/types/depot-annonce";

const CarteLeafletPicker = dynamic(() => import("./CarteLeafletPicker"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--color-menthe)",
        color: "var(--color-foret)",
        fontSize: "14px",
      }}
    >
      Chargement de la carte…
    </div>
  ),
});

const champLabelStyle: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 };
const champErreurStyle: React.CSSProperties = { color: "var(--color-erreur)", fontSize: 13, marginTop: 4 };

// Moyenne simple des sommets — suffisant pour centrer la carte et servir de
// point de repère (Annonce.can_publish() exige un point, cf. contrat §6.1) ;
// pas besoin du vrai centroïde géométrique PostGIS pour cet usage.
function centroide(sommets: [number, number][]): [number, number] {
  const lat = sommets.reduce((s, p) => s + p[0], 0) / sommets.length;
  const lng = sommets.reduce((s, p) => s + p[1], 0) / sommets.length;
  return [lat, lng];
}

export function EtapeLocalisation({
  annonce,
  onPrecedent,
  onSuivant,
}: {
  annonce: AnnonceEcriture;
  onPrecedent: () => void;
  onSuivant: (annonce: AnnonceEcriture) => void;
}) {
  const [state, formAction, pending] = useActionState<DepotFormState, FormData>(
    enregistrerLocalisationAction,
    null,
  );

  const [regions, setRegions] = useState<RegionRef[]>([]);
  const [provinces, setProvinces] = useState<ProvinceRef[]>([]);
  const [communes, setCommunes] = useState<CommuneRef[]>([]);
  const [regionCode, setRegionCode] = useState("");
  const [provinceCode, setProvinceCode] = useState("");
  const [communeId, setCommuneId] = useState("");
  // Pré-rempli si l'utilisateur revient sur cette étape après avoir déjà
  // placé un repère — la cascade région/province/commune, elle, doit être
  // re-choisie (pas de lookup inverse commune -> région/province côté API).
  const [position, setPosition] = useState<[number, number] | null>(
    annonce.parcelle.latitude !== null && annonce.parcelle.longitude !== null
      ? [annonce.parcelle.latitude, annonce.parcelle.longitude]
      : null,
  );
  // Le point (position) reste toujours la donnée soumise pour la géoloc
  // (Annonce.can_publish()) — en mode polygone il est recalculé (centroïde)
  // à chaque sommet ajouté, jamais saisi directement par le vendeur.
  const [mode, setMode] = useState<"point" | "polygone">(
    annonce.parcelle.contour !== null && annonce.parcelle.contour.length >= 3 ? "polygone" : "point",
  );
  const [contour, setContour] = useState<[number, number][]>(annonce.parcelle.contour ?? []);

  function gererContour(sommets: [number, number][]) {
    setContour(sommets);
    if (sommets.length > 0) setPosition(centroide(sommets));
  }

  useEffect(() => {
    fetchRegions().then(setRegions).catch(() => setRegions([]));
  }, []);

  // Le clear des listes filles (provinces/communes) se fait directement dans
  // les onChange des <select> ci-dessous, pas ici : un effet ne doit faire du
  // setState synchrone qu'en réponse à un système externe (ici, le fetch),
  // jamais comme simple réaction à un changement d'état interne au composant.
  useEffect(() => {
    if (!regionCode) return;
    fetchProvinces(regionCode).then(setProvinces).catch(() => setProvinces([]));
  }, [regionCode]);

  useEffect(() => {
    if (!provinceCode) return;
    fetchCommunes(provinceCode).then(setCommunes).catch(() => setCommunes([]));
  }, [provinceCode]);

  useEffect(() => {
    if (state?.annonce) onSuivant(state.annonce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const pretAContinuer =
    communeId !== "" && (mode === "point" ? position !== null : contour.length >= 3);
  // Un contour n'est soumis que si le vendeur a fini son tracé en mode
  // Polygone — passer en mode Point avant de valider revient à renoncer au
  // tracé pour cette soumission, cohérent avec le "soit point, soit
  // polygone" du picker (jamais les deux en même temps).
  const contourASoumettre = mode === "polygone" && contour.length >= 3 ? contour : null;

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Où se trouve votre parcelle ?</h2>
        <p style={{ fontSize: 14, color: "var(--color-secondaire)", margin: 0 }}>
          Sélectionnez la commune, puis placez un repère précis sur la carte.
        </p>
      </div>

      <input type="hidden" name="id" value={annonce.id} />
      <input type="hidden" name="commune" value={communeId} />
      <input type="hidden" name="latitude" value={position ? position[0] : ""} />
      <input type="hidden" name="longitude" value={position ? position[1] : ""} />
      <input type="hidden" name="contour" value={contourASoumettre ? JSON.stringify(contourASoumettre) : ""} />

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="region" style={champLabelStyle}>Région</label>
          <select
            id="region"
            className="input select-chevron"
            value={regionCode}
            onChange={(e) => {
              setRegionCode(e.target.value);
              setProvinceCode("");
              setCommuneId("");
              setProvinces([]);
              setCommunes([]);
            }}
          >
            <option value="">Choisir...</option>
            {regions.map((r) => (
              <option key={r.id} value={r.code}>{r.nom}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="province" style={champLabelStyle}>Province</label>
          <select
            id="province"
            className="input select-chevron"
            value={provinceCode}
            disabled={!regionCode}
            onChange={(e) => {
              setProvinceCode(e.target.value);
              setCommuneId("");
              setCommunes([]);
            }}
          >
            <option value="">Choisir...</option>
            {provinces.map((p) => (
              <option key={p.id} value={p.code}>{p.nom}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="commune" style={champLabelStyle}>Commune</label>
          <select
            id="commune"
            className="input select-chevron"
            value={communeId}
            disabled={!provinceCode}
            onChange={(e) => setCommuneId(e.target.value)}
          >
            <option value="">Choisir...</option>
            {communes.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </div>
      </div>
      {state?.fieldErrors?.parcelle && <p style={champErreurStyle}>{state.fieldErrors.parcelle[0]}</p>}

      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <label style={{ ...champLabelStyle, marginBottom: 0 }}>Emplacement précis</label>
          <div style={{ display: "flex", gap: 3, backgroundColor: "var(--color-fond)", borderRadius: "var(--radius-btn)", padding: 3 }}>
            {(["point", "polygone"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  padding: "5px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  border: "none",
                  borderRadius: "var(--radius-xs)",
                  cursor: "pointer",
                  backgroundColor: mode === m ? "white" : "transparent",
                  color: mode === m ? "var(--color-foret)" : "var(--color-tertiaire)",
                  boxShadow: mode === m ? "0 1px 2px rgba(27,58,45,0.12)" : "none",
                }}
              >
                {m === "point" ? "Point" : "Polygone"}
              </button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 13, color: "var(--color-secondaire)", margin: "0 0 8px" }}>
          {mode === "point"
            ? "Cliquez sur la carte pour placer un repère (déplaçable ensuite par glisser-déposer)."
            : "Cliquez sur la carte pour tracer le contour de la parcelle, sommet par sommet (3 minimum)."}
        </p>
        <div
          style={{
            height: 320,
            borderRadius: "var(--radius-card)",
            overflow: "hidden",
            border: "1px solid var(--color-bordure)",
          }}
        >
          {mode === "point" ? (
            <CarteLeafletPicker mode="point" position={position} onPositionChange={setPosition} />
          ) : (
            <CarteLeafletPicker mode="polygone" contour={contour} onContourChange={gererContour} />
          )}
        </div>
        {mode === "polygone" && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <span style={{ fontSize: 12, color: "var(--color-tertiaire)" }}>
              {contour.length === 0
                ? "Aucun sommet placé."
                : `${contour.length} sommet${contour.length > 1 ? "s" : ""} placé${contour.length > 1 ? "s" : ""}${contour.length < 3 ? " — 3 minimum" : ""}.`}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn-ghost"
                disabled={contour.length === 0}
                onClick={() => gererContour(contour.slice(0, -1))}
                style={{ fontSize: 12, padding: "4px 10px" }}
              >
                Annuler le dernier point
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={contour.length === 0}
                onClick={() => setContour([])}
                style={{ fontSize: 12, padding: "4px 10px" }}
              >
                Recommencer
              </button>
            </div>
          </div>
        )}
      </div>

      {state?.error && <p className="akal-alert-in" style={{ color: "var(--color-erreur)", fontSize: 14 }}>{state.error}</p>}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <button type="button" className="btn-secondary" onClick={onPrecedent}>
          Précédent
        </button>
        <button type="submit" className="btn-primary" disabled={pending || !pretAContinuer}>
          {pending ? "Enregistrement…" : "Continuer"}
        </button>
      </div>
    </form>
  );
}
