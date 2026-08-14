"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, GeoJSON, useMap } from "react-leaflet";
// Alias pour éviter la collision de nom avec le composant GeoJSON de
// react-leaflet importé ci-dessus — `import type * as` pour ne référencer
// que les types du namespace global fourni par @types/geojson.
import type * as GJ from "geojson";
import MarkerClusterGroup from "react-leaflet-cluster";
import Link from "next/link";
import type { Parcelle } from "@/types/parcelle";
import TuileOSM from "@/components/TuileOSM";
import { iconeAkal, CENTRE_MAROC } from "@/lib/leaflet";
import { formatMAD } from "@/lib/format";
import { apiFetch } from "@/lib/api";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

// Région active côté carte : centre dérivé de la moyenne des parcelles
// réelles de la région (jamais un tracé inventé) — cf. statsParRegion dans
// app/page.tsx. `centre` peut être null si la région n'a aucune parcelle.
export type RegionActive = { code: string; nom: string; centre: [number, number] | null } | null;

// GeoJSON minimal utile ici — FeatureCollection de provinces (contrat API
// /api/geo/limites/provinces/?region=<slug>, cf. geo/serializers.py).
type FeatureCollectionProvinces = {
  type: "FeatureCollection";
  features: { type: "Feature"; geometry: GJ.Geometry; properties: Record<string, unknown> }[];
};

// Limite réelle de la région active — union des provinces qui la composent
// (référentiel géométrique officiel, cf. geo/models.py ProvinceGeom). Un
// seul appel par région sélectionnée ; jamais de tracé approximatif/inventé
// à la place (remplace l'ancien halo circulaire "spotlight" qui ne
// représentait aucune vraie limite).
function LimiteRegion({ code }: { code: string | null }) {
  const [donnees, setDonnees] = useState<FeatureCollectionProvinces | null>(null);

  useEffect(() => {
    // Pas de setDonnees(null) synchrone ici pour `!code` (react-hooks/
    // set-state-in-effect — CI, cf. job 94769774578) : dériver directement
    // du prop `code` au rendu ci-dessous plutôt que resynchroniser un état
    // "vide" par effet. `donnees` peut rester stale en mémoire le temps
    // qu'une prochaine région soit sélectionnée — sans conséquence visuelle
    // puisque le rendu est de toute façon masqué tant que `code` est null.
    if (!code) return;
    let annule = false;
    apiFetch<FeatureCollectionProvinces>("/geo/limites/provinces/", { params: { region: code } })
      .then((d) => {
        if (!annule) setDonnees(d);
      })
      .catch(() => {
        if (!annule) setDonnees(null);
      });
    return () => {
      annule = true;
    };
  }, [code]);

  if (!code || !donnees) return null;
  return (
    <GeoJSON
      key={code}
      data={donnees as GJ.FeatureCollection}
      style={{ color: "#2D6A4F", weight: 2, fillColor: "#52B788", fillOpacity: 0.12 }}
    />
  );
}

function VolVersRegion({ centre }: { centre: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (centre) map.flyTo(centre, 8, { duration: 0.8 });
    else map.flyTo(CENTRE_MAROC, 6, { duration: 0.8 });
  }, [centre, map]);
  return null;
}

export default function CarteCouvertureLeaflet({
  parcelles,
  regionActive,
}: {
  parcelles: Parcelle[];
  regionActive: RegionActive;
}) {
  const visibles = useMemo(
    () => (regionActive ? parcelles.filter((p) => p.parcelle.regionNom === regionActive.nom) : parcelles),
    [parcelles, regionActive]
  );

  return (
    <MapContainer center={CENTRE_MAROC} zoom={6} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
      <TuileOSM />

      <VolVersRegion centre={regionActive?.centre ?? null} />

      {/* Limite réelle de la région sélectionnée (union des provinces qui la
          composent, référentiel géométrique officiel) — remplace l'ancien
          halo circulaire "spotlight" qui ne représentait aucune vraie
          limite (cf. LimiteRegion ci-dessus). */}
      <LimiteRegion code={regionActive?.code ?? null} />

      <MarkerClusterGroup key={regionActive?.code ?? "tout"} chunkedLoading maxClusterRadius={45}>
        {visibles.map((p) => (
          <Marker key={p.id} position={[p.parcelle.latitude, p.parcelle.longitude]} icon={iconeAkal}>
            <Popup>
              <div style={{ minWidth: "160px" }}>
                <strong style={{ fontSize: "13px", color: "#2D6A4F" }}>{p.titre}</strong>
                <div style={{ fontSize: "12px", color: "#555", margin: "4px 0" }}>
                  {p.parcelle.regionNom} · {p.parcelle.surface} ha
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#2D6A4F" }}>
                  {formatMAD.format(p.prix)} MAD
                </div>
                <Link href={`/parcelles/${p.slug}`} style={{ fontSize: "12px", color: "#C4622D", textDecoration: "underline" }}>
                  Voir l&apos;annonce →
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
