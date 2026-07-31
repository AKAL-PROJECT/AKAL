"use client";

import { useActionState, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { enregistrerLocalisationAction, type DepotFormState } from "@/app/actions/depot-annonce";
import { fetchCommunes, fetchProvinces, fetchRegions } from "@/lib/geo-api";
import type { AnnonceEcriture, CommuneRef, ProvinceRef, RegionRef } from "@/types/depot-annonce";

const CarteLeafletPicker = dynamic(() => import("./CarteLeafletPicker"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100%", width: "100%", backgroundColor: "var(--color-fond-input)" }} />
  ),
});

const champLabelStyle: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 };
const champErreurStyle: React.CSSProperties = { color: "var(--color-erreur)", fontSize: 13, marginTop: 4 };

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

  const pretAContinuer = communeId !== "" && position !== null;

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

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="region" style={champLabelStyle}>Région</label>
          <select
            id="region"
            className="input"
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
            className="input"
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
            className="input"
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
        <label style={champLabelStyle}>Emplacement précis</label>
        <p style={{ fontSize: 13, color: "var(--color-secondaire)", margin: "0 0 8px" }}>
          Cliquez sur la carte pour placer un repère (déplaçable ensuite par glisser-déposer).
        </p>
        <div
          style={{
            height: 320,
            borderRadius: "var(--radius-card)",
            overflow: "hidden",
            border: "1px solid var(--color-bordure)",
          }}
        >
          <CarteLeafletPicker position={position} onChange={setPosition} />
        </div>
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
