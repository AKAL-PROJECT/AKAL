import type { AccesEau, Parcelle } from "@/types/parcelle";
import BadgeStatut from "./BadgeStatut";
import {
  Ruler,
  Shield,
  Droplets,
  TrendingUp,
} from "@/components/icons/Icons";
import { formatMAD } from "@/lib/format";

type Groupe = {
  titre: string;
  accent: string;
  items: ItemCarac[];
};

type ItemCarac =
  | { type: "texte"; icon: React.ReactNode; label: string; valeur: string; couleur?: string }
  | { type: "badge"; icon: React.ReactNode; label: string; parcelle: Parcelle };

const ACCES_EAU_LABEL: Record<AccesEau, string> = {
  irriguee: "Irriguée (réseau)",
  bour: "Bour (pluviale)",
  mixte: "Mixte",
};

// Région/localisation déjà affichées juste sous le titre (FicheParcelle) et
// AgriScore déjà mis en avant dans sa propre carte — volontairement absents
// d'ici pour ne pas répéter la même information deux fois sur la page
// (§ "regrouper l'information de façon plus logique", refonte Phase 2).
function buildGroupes(a: Parcelle): Groupe[] {
  const prixHa = a.prixM2 * 10_000;
  const surfaceM2 = Math.round(a.parcelle.surface * 10_000).toLocaleString("fr-MA");

  return [
    {
      titre: "Foncier",
      accent: "var(--color-info)",
      items: [
        {
          type: "texte",
          icon: <Ruler size={13} />,
          label: "Superficie",
          valeur: `${a.parcelle.surface} ha · ${surfaceM2} m²`,
        },
        // Statut foncier désormais facultatif au dépôt (audit dépôt
        // d'annonce, correctif optionalité) : item omis plutôt qu'un badge
        // vide si absent — même traitement que les champs Agronomie
        // ci-dessous (BadgeStatut renvoie déjà null sur statut=null, mais
        // laisser l'item inconditionnel affichait quand même la ligne
        // "Statut foncier" vide de tout badge).
        ...(a.parcelle.statutFoncier
          ? [{ type: "badge" as const, icon: <Shield size={13} />, label: "Statut foncier", parcelle: a }]
          : []),
      ],
    },
    {
      titre: "Agronomie",
      accent: "var(--color-argile)",
      items: [
        // Accès à l'eau non renseigné (annonces scrapées) : item omis
        // plutôt qu'un libellé inventé — même traitement que topographie
        // juste en dessous, déjà conditionnel pour la même raison.
        ...(a.parcelle.accesEau
          ? [{
              type: "texte" as const,
              icon: <Droplets size={13} />,
              label: "Accès à l'eau",
              valeur: ACCES_EAU_LABEL[a.parcelle.accesEau],
              couleur: a.parcelle.accesEau === "bour" ? "var(--color-tertiaire)" : "var(--color-info)",
            }]
          : []),
        ...(a.parcelle.topographie
          ? [{ type: "texte" as const, icon: <Ruler size={13} />, label: "Topographie", valeur: a.parcelle.topographie }]
          : []),
      ],
    },
    {
      titre: "Valorisation",
      accent: "var(--color-terre)",
      items: [
        {
          type: "texte",
          icon: <TrendingUp size={13} />,
          label: "Prix au m²",
          valeur: `${a.prixM2} MAD/m²`,
        },
        {
          type: "texte",
          icon: <TrendingUp size={13} />,
          label: "Prix à l'hectare",
          valeur: `${formatMAD.format(prixHa)} MAD/ha`,
        },
      ],
    },
  ];
}

function RowItem({ item }: { item: ItemCarac }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "10px 14px",
        borderBottom: "1px solid var(--color-bordure)",
      }}
    >
      <span style={{ color: "var(--color-tertiaire)", flexShrink: 0, marginTop: "2px" }}>
        {item.icon}
      </span>
      <span style={{ fontSize: "12px", color: "var(--color-tertiaire)", flex: "0 0 120px" }}>
        {item.label}
      </span>

      {item.type === "texte" && (
        <span
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: item.couleur ?? "var(--color-nuit)",
            flex: 1,
          }}
        >
          {item.valeur}
        </span>
      )}
      {item.type === "badge" && (
        <span style={{ flex: 1 }}>
          <BadgeStatut statut={item.parcelle.parcelle.statutFoncier} />
        </span>
      )}
    </div>
  );
}

export default function BlocCaracteristiques({ parcelle }: { parcelle: Parcelle }) {
  // Un groupe (ex. "Agronomie") peut n'avoir plus aucun item une fois ses
  // lignes conditionnelles toutes omises (donnée absente, cf. buildGroupes)
  // — sur les annonces scrapées, ça arrive. Sans ce filtre, le groupe se
  // rendait quand même : titre + cadre + conteneur vides, une carte blanche
  // avec juste "AGRONOMIE" dedans qui ressemble à un module cassé. On ne
  // remplace jamais une donnée manquante par une valeur inventée (déjà le
  // principe pour les lignes individuelles) — on retire simplement le
  // groupe entier plutôt que de l'afficher vide.
  const groupes = buildGroupes(parcelle).filter((g) => g.items.length > 0);

  return (
    <section>
      <h2 className="fiche-section-titre">Caractéristiques de la parcelle</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "12px",
        }}
      >
        {groupes.map((g) => (
          <div
            key={g.titre}
            style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--color-bordure)",
              overflow: "hidden",
            }}
          >
            {/* En-tête du groupe — bordure d'accent adoucie (audit fiche du
                19/08) : color-mix() plutôt que la couleur de la palette en
                pleine intensité, pour rester un simple séparateur discret
                et non un bloc de couleur qui tire l'œil plus que les
                données elles-mêmes. Le point + le libellé ci-dessous
                gardent, eux, la couleur pleine (assez petits pour ne pas
                surcharger). */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 14px",
                backgroundColor: "var(--color-fond)",
                borderBottom: `2px solid color-mix(in srgb, ${g.accent} 45%, transparent)`,
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: g.accent,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  color: g.accent,
                }}
              >
                {g.titre}
              </span>
            </div>

            {/* Lignes */}
            <div style={{ backgroundColor: "white" }}>
              {g.items.map((item, i) => (
                <div
                  key={item.label}
                  style={
                    i === g.items.length - 1
                      ? {}
                      : { borderBottom: "1px solid var(--color-bordure)" }
                  }
                >
                  <RowItem item={item} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
