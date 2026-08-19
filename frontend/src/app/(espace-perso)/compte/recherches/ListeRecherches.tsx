"use client";

// Liste + actions (pause/réactivation, suppression) des recherches
// sauvegardées (alertes, 2026-08-19) — pas de modale de confirmation
// contrairement à ListeAnnonces.tsx (archiver/marquer vendue une annonce
// est bien plus lourd de conséquences qu'arrêter une alerte) : mise à jour
// optimiste avec retour arrière en cas d'échec, même principe que
// useFavorisIds.ts.
import { useState } from "react";
import { Bell, X } from "@/components/icons/Icons";
import {
  basculerRechercheSauvegardeeAction,
  supprimerRechercheSauvegardeeAction,
} from "@/app/actions/recherches-sauvegardees";
import type { RechercheSauvegardee } from "@/lib/recherches-sauvegardees-api";

// Libellés lisibles des critères stockés (mêmes clés que
// data/parcelles.ts::filtresVersCriteresAlerte) — pour afficher un résumé
// humain plutôt que le JSON brut ({"region": "souss-massa", ...}).
const LABEL_CRITERE: Record<string, string> = {
  region: "Région",
  province: "Province",
  commune: "Commune",
  statut_foncier: "Statut foncier",
  acces_eau: "Accès à l'eau",
  prix_min: "Prix min.",
  prix_max: "Prix max.",
  surface_min: "Surface min. (ha)",
  surface_max: "Surface max. (ha)",
};

function resumeCriteres(criteres: Record<string, string>): string {
  const entrees = Object.entries(criteres).filter(([, v]) => v !== "" && v != null);
  if (entrees.length === 0) return "Tout le catalogue";
  return entrees.map(([cle, valeur]) => `${LABEL_CRITERE[cle] ?? cle} : ${valeur}`).join(" · ");
}

export function ListeRecherches({ recherches }: { recherches: RechercheSauvegardee[] }) {
  const [items, setItems] = useState(recherches);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function basculer(id: string, actif: boolean) {
    setEnCours(id);
    setErreur(null);
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, actif } : r)));
    const resultat = await basculerRechercheSauvegardeeAction(id, actif);
    if (!resultat.ok) {
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, actif: !actif } : r)));
      setErreur(resultat.error);
    }
    setEnCours(null);
  }

  async function supprimer(id: string) {
    setEnCours(id);
    setErreur(null);
    const precedent = items;
    setItems((prev) => prev.filter((r) => r.id !== id));
    const resultat = await supprimerRechercheSauvegardeeAction(id);
    if (!resultat.ok) {
      setItems(precedent);
      setErreur(resultat.error);
    }
    setEnCours(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {erreur && <p style={{ fontSize: "13px", color: "var(--color-erreur)", margin: 0 }}>{erreur}</p>}
      {items.map((r) => (
        <div
          key={r.id}
          className="card"
          style={{ padding: "16px", display: "flex", alignItems: "center", gap: "14px", opacity: r.actif ? 1 : 0.6 }}
        >
          <span
            style={{
              width: "36px", height: "36px", borderRadius: "var(--radius-sm)", flexShrink: 0,
              backgroundColor: r.actif ? "var(--color-menthe)" : "var(--color-fond-input)",
              color: "var(--color-foret)", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Bell size={16} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-texte)" }}>
              {r.nom || "Recherche sans nom"}
              {!r.actif && <span style={{ fontSize: "12px", color: "var(--color-tertiaire)", fontWeight: 400 }}> · en pause</span>}
            </div>
            <div style={{ fontSize: "13px", color: "var(--color-secondaire)", marginTop: "2px" }}>
              {resumeCriteres(r.criteres)}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => basculer(r.id, !r.actif)}
              disabled={enCours === r.id}
              className="akal-focusable"
              style={{ padding: "6px 12px", fontSize: "13px", background: "none", border: "1px solid var(--color-bordure)", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--color-secondaire)" }}
            >
              {r.actif ? "Mettre en pause" : "Réactiver"}
            </button>
            <button
              type="button"
              onClick={() => supprimer(r.id)}
              disabled={enCours === r.id}
              aria-label="Supprimer cette alerte"
              title="Supprimer cette alerte"
              className="akal-focusable"
              style={{ padding: "6px", background: "none", border: "1px solid var(--color-bordure)", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--color-erreur)", display: "flex" }}
            >
              <X size={15} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
