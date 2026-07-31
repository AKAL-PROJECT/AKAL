import { MountainEmpty } from "@/components/icons/Icons";

type Props = {
  titre: string;
  description?: string;
  action?: React.ReactNode;
};

// État vide générique — même badge circulaire (texture topographique de
// marque + icône) partout où une liste peut être vide (catalogue, favoris,
// comparateur, messagerie, mes annonces), pour que ces écrans appartiennent
// clairement au même univers graphique plutôt que d'improviser chacun le
// leur. Aucune nouvelle dépendance : réutilise .akal-texture-topo et
// MountainEmpty, déjà dans le système.
export function EtatVide({ titre, description, action }: Props) {
  return (
    <div
      className="akal-fade-in"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        padding: "80px 20px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "104px",
          height: "104px",
          borderRadius: "50%",
          backgroundColor: "var(--color-rosee)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div className="akal-texture-topo" aria-hidden style={{ opacity: 0.5 }} />
        <span style={{ position: "relative", display: "flex", color: "var(--color-foret)" }}>
          <MountainEmpty size={44} />
        </span>
      </div>
      <p style={{ fontSize: "16px", fontWeight: 500, color: "var(--color-texte)", margin: 0 }}>{titre}</p>
      {description && (
        <p style={{ fontSize: "14px", color: "var(--color-secondaire)", margin: 0, maxWidth: "320px" }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
