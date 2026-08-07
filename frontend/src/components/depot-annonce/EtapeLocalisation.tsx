"use client";

import { useActionState, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { enregistrerLocalisationAction, type DepotFormState } from "@/app/actions/depot-annonce";
import { fetchCommuneGeomDetail, fetchCommunesGeom, fetchProvincesGeom, fetchRegionsOfficielles } from "@/lib/geo-api";
import type { AnnonceEcriture, CommuneGeomRef, ProvinceGeomRef, RegionOfficielleRef } from "@/types/depot-annonce";

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

const boutonModeStyle = (actif: boolean): React.CSSProperties => ({
  flex: 1,
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 500,
  border: "1px solid var(--color-bordure)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  background: actif ? "var(--color-foret)" : "white",
  color: actif ? "white" : "var(--color-texte)",
});

export function EtapeLocalisation({
  annonce,
  onPrecedent,
  onSuivant,
  modeEdition = false,
}: {
  annonce: AnnonceEcriture;
  onPrecedent: () => void;
  onSuivant: (annonce: AnnonceEcriture) => void;
  // Modification d'une annonce déjà déposée (2026-08-07), par opposition au
  // dépôt initial — cf. DepotAnnonceWizard. N'affecte que la copie ci-dessous ;
  // le pré-remplissage de la cascade région/province/commune juste après
  // s'applique dans les deux cas (utile aussi en dépôt initial si on revient
  // en arrière après avoir déjà choisi une commune).
  modeEdition?: boolean;
}) {
  const [state, formAction, pending] = useActionState<DepotFormState, FormData>(
    enregistrerLocalisationAction,
    null,
  );

  // Cascade sur le référentiel géométrique officiel (2026-08-06) — 12
  // régions/75 provinces/1536 communes réelles, cf.
  // docs/plans/2026-08-06-communes-geo-design.md. `regionSlug`/`provinceId`
  // ne pilotent que la cascade de sélection ; seul `communeId` (id
  // CommuneGeom) est réellement envoyé au serveur.
  const [regions, setRegions] = useState<RegionOfficielleRef[]>([]);
  const [provinces, setProvinces] = useState<ProvinceGeomRef[]>([]);
  const [communes, setCommunes] = useState<CommuneGeomRef[]>([]);
  const [regionSlug, setRegionSlug] = useState("");
  const [provinceId, setProvinceId] = useState("");
  const [communeId, setCommuneId] = useState("");
  // Pré-rempli si l'utilisateur revient sur cette étape après avoir déjà
  // placé un repère — la cascade région/province/commune, elle, doit être
  // re-choisie (pas de lookup inverse commune -> région/province côté API).
  const [position, setPosition] = useState<[number, number] | null>(
    annonce.parcelle.latitude !== null && annonce.parcelle.longitude !== null
      ? [annonce.parcelle.latitude, annonce.parcelle.longitude]
      : null,
  );
  // Dessin de parcelle (2026-08-05) : contour optionnel, en plus du repère
  // ci-dessus — jamais de centroïde calculé côté front (le backend, seul
  // dépositaire de GEOS, reste l'unique source de vérité pour ce calcul ;
  // cf. AnnonceEcritureSerializer._finaliser_contour). Le mode par défaut
  // repart sur "polygone" si un contour existe déjà, pour le réafficher en
  // l'état plutôt que de forcer un retour au mode Point.
  const [contour, setContour] = useState<[number, number][]>(
    annonce.parcelle.contour?.map((s) => [s.latitude, s.longitude] as [number, number]) ?? [],
  );
  const [mode, setMode] = useState<"point" | "polygone">(
    annonce.parcelle.contour && annonce.parcelle.contour.length > 0 ? "polygone" : "point",
  );

  useEffect(() => {
    fetchRegionsOfficielles().then(setRegions).catch(() => setRegions([]));
  }, []);

  // Pré-remplissage de la cascade région/province/commune (2026-08-07) — au
  // montage uniquement (annonce ne change plus après, ce composant étant
  // démonté/remonté à chaque changement d'étape du wizard, cf. `key={etape}`
  // dans DepotAnnonceWizard). Aucun lookup inverse commune -> région/province
  // n'existait avant l'ajout de fetchCommuneGeomDetail : sans ça, rouvrir la
  // localisation d'une annonce déjà géolocalisée réaffichait "Choisir..."
  // dans les trois listes malgré une commune déjà enregistrée. On ne
  // déclenche fetchProvincesGeom/fetchCommunesGeom nous-mêmes : régler
  // regionSlug/provinceId suffit, les deux effets de cascade existants
  // ci-dessous s'en chargent.
  useEffect(() => {
    const idCommune = annonce.parcelle.commune_geom;
    if (idCommune === null) return;
    fetchCommuneGeomDetail(idCommune)
      .then((commune) => {
        setRegionSlug(commune.region.slug);
        setProvinceId(String(commune.province.id));
        setCommuneId(String(commune.id));
      })
      .catch(() => {
        // Commune supprimée/renumérotée depuis l'enregistrement de l'annonce
        // (improbable, référentiel figé) — on laisse la cascade vierge plutôt
        // que de bloquer l'accès à l'étape.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Le clear des listes filles (provinces/communes) se fait directement dans
  // les onChange des <select> ci-dessous, pas ici : un effet ne doit faire du
  // setState synchrone qu'en réponse à un système externe (ici, le fetch),
  // jamais comme simple réaction à un changement d'état interne au composant.
  useEffect(() => {
    if (!regionSlug) return;
    fetchProvincesGeom(regionSlug).then(setProvinces).catch(() => setProvinces([]));
  }, [regionSlug]);

  useEffect(() => {
    if (!provinceId) return;
    fetchCommunesGeom({ province: Number(provinceId) }).then(setCommunes).catch(() => setCommunes([]));
  }, [provinceId]);

  useEffect(() => {
    if (state?.annonce) onSuivant(state.annonce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // 1 ou 2 sommets = polygone en cours, ni exploitable ni abandonné : état
  // ambigu qui bloque la suite, quel que soit le repère par ailleurs (§5 de
  // la décision du 2026-08-05). 0 sommet est valide (mode Point pur) ; ≥3
  // l'est aussi (mode Polygone — le backend recalcule le centroïde si aucun
  // repère manuel n'est posé, donc `position` seul ne conditionne plus la
  // géolocalisation dès qu'un contour complet existe).
  const contourAmbigu = contour.length === 1 || contour.length === 2;
  const geolocalisee = position !== null || contour.length >= 3;
  const pretAContinuer = communeId !== "" && geolocalisee && !contourAmbigu;

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>
          {modeEdition ? "Modifiez la localisation" : "Où se trouve votre parcelle ?"}
        </h2>
        <p style={{ fontSize: 14, color: "var(--color-secondaire)", margin: 0 }}>
          {modeEdition
            ? "Changez de commune, déplacez le repère ou redessinez le contour — chaque étape est enregistrée dès que vous cliquez sur Continuer."
            : "Sélectionnez la commune, puis placez un repère précis sur la carte — ou dessinez le contour exact de la parcelle."}
        </p>
      </div>

      <input type="hidden" name="id" value={annonce.id} />
      <input type="hidden" name="commune_geom" value={communeId} />
      <input type="hidden" name="latitude" value={position ? position[0] : ""} />
      <input type="hidden" name="longitude" value={position ? position[1] : ""} />
      <input
        type="hidden"
        name="contour"
        value={JSON.stringify(contour.map(([latitude, longitude]) => ({ latitude, longitude })))}
      />

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="region" style={champLabelStyle}>Région</label>
          <select
            id="region"
            className="input select-chevron"
            value={regionSlug}
            onChange={(e) => {
              setRegionSlug(e.target.value);
              setProvinceId("");
              setCommuneId("");
              setProvinces([]);
              setCommunes([]);
            }}
          >
            <option value="">Choisir...</option>
            {regions.map((r) => (
              <option key={r.code} value={r.slug}>{r.nom}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="province" style={champLabelStyle}>Province</label>
          <select
            id="province"
            className="input select-chevron"
            value={provinceId}
            disabled={!regionSlug}
            onChange={(e) => {
              setProvinceId(e.target.value);
              setCommuneId("");
              setCommunes([]);
            }}
          >
            <option value="">Choisir...</option>
            {provinces.map((p) => (
              <option key={p.id} value={p.id}>{p.nom}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="commune" style={champLabelStyle}>Commune</label>
          <select
            id="commune"
            className="input select-chevron"
            value={communeId}
            disabled={!provinceId}
            onChange={(e) => setCommuneId(e.target.value)}
          >
            <option value="">Choisir...</option>
            {communes.map((c) => (
              <option key={c.id} value={c.id}>{c.nomAffichage}</option>
            ))}
          </select>
        </div>
      </div>
      {state?.fieldErrors?.parcelle && <p style={champErreurStyle}>{state.fieldErrors.parcelle[0]}</p>}

      <div>
        <label style={champLabelStyle}>Emplacement précis</label>

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button type="button" style={boutonModeStyle(mode === "point")} onClick={() => setMode("point")}>
            Ajouter un point
          </button>
          <button type="button" style={boutonModeStyle(mode === "polygone")} onClick={() => setMode("polygone")}>
            Dessiner un polygone
          </button>
        </div>

        <p style={{ fontSize: 13, color: "var(--color-secondaire)", margin: "0 0 8px" }}>
          {mode === "point"
            ? "Cliquez sur la carte pour placer un repère (déplaçable ensuite par glisser-déposer)."
            : "Cliquez sur la carte pour ajouter les sommets du contour, dans l'ordre. Chaque sommet reste déplaçable par glisser-déposer."}
        </p>

        <div
          style={{
            height: 320,
            borderRadius: "var(--radius-card)",
            overflow: "hidden",
            border: "1px solid var(--color-bordure)",
          }}
        >
          <CarteLeafletPicker
            mode={mode}
            position={position}
            onChangePosition={setPosition}
            contour={contour}
            // Mises à jour fonctionnelles : deux événements carte rapprochés
            // (clic, glisser) avant le re-render suivant doivent tous les
            // deux s'appliquer sur l'état le plus récent, jamais sur une
            // fermeture obsolète (cf. commentaire CarteLeafletPicker).
            onAjouterSommet={(sommet) => setContour((prev) => [...prev, sommet])}
            onDeplacerSommet={(index, sommet) =>
              setContour((prev) => prev.map((s, j) => (j === index ? sommet : s)))
            }
          />
        </div>

        {mode === "polygone" && (
          <div style={{ marginTop: 10 }}>
            {contourAmbigu && (
              <p style={champErreurStyle}>
                Encore {3 - contour.length} sommet{3 - contour.length > 1 ? "s" : ""} pour former un polygone valide.
              </p>
            )}
            {contour.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {contour.map((_, i) => (
                  <span
                    key={i}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "var(--color-menthe)",
                      borderRadius: 999,
                      padding: "4px 6px 4px 10px",
                      fontSize: 12,
                    }}
                  >
                    Sommet {i + 1}
                    <button
                      type="button"
                      onClick={() => setContour((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Supprimer le sommet ${i + 1}`}
                      style={{
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        color: "var(--color-erreur)",
                        fontWeight: 700,
                        fontSize: 14,
                        lineHeight: 1,
                        padding: 2,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {contour.length >= 3 && (
              <button
                type="button"
                className="btn-secondary"
                style={{ marginTop: 10 }}
                onClick={() => setMode("point")}
              >
                Terminer le polygone
              </button>
            )}
          </div>
        )}
      </div>

      {state?.error && <p className="akal-alert-in" style={{ color: "var(--color-erreur)", fontSize: 14 }}>{state.error}</p>}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <button type="button" className="btn-secondary" onClick={onPrecedent}>
          Précédent
        </button>
        <button type="submit" className="btn-primary" disabled={pending || !pretAContinuer}>
          {pending ? "Enregistrement…" : modeEdition ? "Enregistrer" : "Continuer"}
        </button>
      </div>
    </form>
  );
}
