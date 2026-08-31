"use client";

import { useActionState, useEffect, useState } from "react";
import { enregistrerInfosGeneralesAction, type DepotFormState } from "@/app/actions/depot-annonce";
import { hectaresVersM2 } from "@/lib/format";
import type { AnnonceEcriture } from "@/types/depot-annonce";

const champLabelStyle: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 };
const champErreurStyle: React.CSSProperties = { color: "var(--color-erreur)", fontSize: 13, marginTop: 4 };

const OPTIONS_STATUT_FONCIER = [
  { value: "melkia", label: "Melkia" },
  { value: "soulaliya", label: "Soulaliya" },
  { value: "guich", label: "Guich" },
  { value: "habous", label: "Habous" },
  { value: "immatricule", label: "Immatriculé" },
];

const OPTIONS_ACCES_EAU = [
  { value: "irriguee", label: "Irriguée" },
  { value: "bour", label: "Bour" },
  { value: "mixte", label: "Mixte" },
];

const OPTIONS_TOPOGRAPHIE = [
  { value: "plat", label: "Plat" },
  { value: "pentu", label: "Pentu" },
  { value: "vallonne", label: "Vallonné" },
];

const OPTIONS_ACCES_ROUTIER = [
  { value: "goudron", label: "Goudron" },
  { value: "piste", label: "Piste" },
  { value: "difficile", label: "Difficile" },
];

export function EtapeInfosGenerales({
  annonce,
  onSuivant,
  modeEdition = false,
}: {
  annonce: AnnonceEcriture | null;
  onSuivant: (annonce: AnnonceEcriture) => void;
  modeEdition?: boolean;
}) {
  const [state, formAction, pending] = useActionState<DepotFormState, FormData>(
    enregistrerInfosGeneralesAction,
    null,
  );

  // Saisie assistée de la surface (audit du 19/08) — l'input reste
  // non-contrôlé (defaultValue, comme le reste de ce formulaire piloté par
  // Server Action) : cet état ne sert qu'à l'aperçu m², jamais à la valeur
  // réellement soumise. Seule la conversion ha → m² est implémentée (unité
  // SI, 1 ha = 10 000 m², aucune ambiguïté) — le kheddam, unité
  // traditionnelle dont la valeur varie selon la région, en a été délibérément
  // exclu plutôt que d'afficher un chiffre qui aurait pu être faux pour la
  // région réelle de l'utilisateur.
  const [apercuSurfaceM2, setApercuSurfaceM2] = useState<string | null>(
    annonce?.parcelle.surface_ha ? hectaresVersM2(annonce.parcelle.surface_ha) : null,
  );

  // useActionState ne redonne la main qu'après résolution de l'action : à ce
  // moment-là seulement (jamais pendant le render), on avance d'étape si la
  // création/édition a réussi.
  useEffect(() => {
    if (state?.annonce) onSuivant(state.annonce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>
          {modeEdition ? "Modifiez les informations" : "Parlez-nous de votre parcelle"}
        </h2>
        <p style={{ fontSize: 14, color: "var(--color-secondaire)", margin: 0 }}>
          Ces informations apparaîtront sur votre annonce.
        </p>
      </div>

      <input type="hidden" name="id" value={annonce?.id ?? ""} />

      <div>
        <label htmlFor="titre" style={champLabelStyle}>Titre de l&apos;annonce</label>
        <input
          id="titre"
          name="titre"
          type="text"
          required
          maxLength={120}
          defaultValue={annonce?.titre}
          placeholder="Ex. Belle parcelle agricole à Dar Bouazza"
          className="input"
        />
        {state?.fieldErrors?.titre && <p style={champErreurStyle}>{state.fieldErrors.titre[0]}</p>}
      </div>

      <div>
        <label htmlFor="description" style={champLabelStyle}>Description</label>
        <textarea
          id="description"
          name="description"
          required
          rows={5}
          defaultValue={annonce?.description}
          placeholder="Décrivez la parcelle : qualité du sol, environnement, accès..."
          className="input"
          style={{ height: "auto", padding: "12px 16px", resize: "vertical" }}
        />
        {state?.fieldErrors?.description && <p style={champErreurStyle}>{state.fieldErrors.description[0]}</p>}
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="prix_mad" style={champLabelStyle}>Prix (MAD)</label>
          <input
            id="prix_mad"
            name="prix_mad"
            type="number"
            min={1}
            step="0.01"
            required
            defaultValue={annonce?.prix_mad}
            className="input"
          />
          {state?.fieldErrors?.prix_mad && <p style={champErreurStyle}>{state.fieldErrors.prix_mad[0]}</p>}
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="surface_ha" style={champLabelStyle}>Surface (hectares)</label>
          <input
            id="surface_ha"
            name="surface_ha"
            type="number"
            min={0.01}
            step="0.01"
            required
            defaultValue={annonce?.parcelle.surface_ha}
            onChange={(e) => {
              const ha = parseFloat(e.target.value);
              setApercuSurfaceM2(Number.isFinite(ha) && ha > 0 ? hectaresVersM2(ha) : null);
            }}
            className="input"
          />
          {apercuSurfaceM2 && (
            <p style={{ fontSize: 12, color: "var(--color-tertiaire)", margin: "6px 0 0" }}>
              Soit environ {apercuSurfaceM2} m²
            </p>
          )}
          {state?.fieldErrors?.parcelle?.[0] && <p style={champErreurStyle}>{state.fieldErrors.parcelle[0]}</p>}
        </div>
      </div>

      {/* Statut foncier + passeport agronomique — facultatifs (annonces
          scrapées/importées : souvent aucune de ces données structurées).
          Ni required ni astérisque : le backend accepte déjà l'absence
          (Parcelle.statut_foncier/acces_eau/topographie/acces_routier sont
          null=True/blank=True, can_publish() ne les vérifie pas).
          Regroupées visuellement (bordure + titre dédié, audit du 16/08) :
          la mention "Facultatif" flottait auparavant juste sous Prix/Surface
          — au premier coup d'œil, rien ne l'empêchait d'être lue comme
          s'appliquant à CES champs (qui restent, eux, réellement requis),
          plutôt qu'au groupe ci-dessous auquel elle est destinée. */}
      <div style={{ borderTop: "1px solid var(--color-bordure)", paddingTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>Caractéristiques du terrain</p>
          <p style={{ fontSize: 13, color: "var(--color-secondaire)", margin: "2px 0 0" }}>
            Facultatif — vous pourrez compléter ces informations plus tard.
          </p>
        </div>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="statut_foncier" style={champLabelStyle}>Statut foncier</label>
          <select
            id="statut_foncier"
            name="statut_foncier"
            defaultValue={annonce?.parcelle.statut_foncier ?? ""}
            className="input select-chevron"
          >
            <option value="">Non renseigné</option>
            {OPTIONS_STATUT_FONCIER.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="acces_eau" style={champLabelStyle}>Accès à l&apos;eau</label>
          <select
            id="acces_eau"
            name="acces_eau"
            defaultValue={annonce?.parcelle.acces_eau ?? ""}
            className="input select-chevron"
          >
            <option value="">Non renseigné</option>
            {OPTIONS_ACCES_EAU.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="topographie" style={champLabelStyle}>Topographie</label>
          <select
            id="topographie"
            name="topographie"
            defaultValue={annonce?.parcelle.topographie ?? ""}
            className="input select-chevron"
          >
            <option value="">Non renseigné</option>
            {OPTIONS_TOPOGRAPHIE.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="acces_routier" style={champLabelStyle}>Accès routier</label>
          <select
            id="acces_routier"
            name="acces_routier"
            defaultValue={annonce?.parcelle.acces_routier ?? ""}
            className="input select-chevron"
          >
            <option value="">Non renseigné</option>
            {OPTIONS_ACCES_ROUTIER.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
        <input
          type="checkbox"
          name="loc_confidentielle"
          defaultChecked={annonce?.loc_confidentielle ?? false}
        />
        Masquer la localisation exacte aux visiteurs (affichée après contact)
      </label>

      {state?.error && <p className="akal-alert-in" style={{ color: "var(--color-erreur)", fontSize: 14 }}>{state.error}</p>}

      <button type="submit" className="btn-primary" disabled={pending} style={{ marginTop: 8, alignSelf: "flex-end" }}>
        {pending ? "Enregistrement…" : modeEdition ? "Enregistrer" : "Continuer"}
      </button>
    </form>
  );
}
