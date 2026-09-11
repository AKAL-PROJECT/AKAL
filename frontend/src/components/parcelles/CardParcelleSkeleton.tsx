// État de chargement de CardParcelle — même gabarit (photo en 4/3, corps
// 14px de padding) pour éviter tout saut de mise en page (CLS) à l'arrivée
// des données réelles. Famille Skeleton* (charte de nommage v1 §3.1).

function Bloc({ width, height = "12px" }: { width: string; height?: string }) {
  return (
    <div
      className="skeleton-shimmer"
      style={{
        width,
        height,
        borderRadius: "var(--radius-xs)",
        backgroundColor: "var(--color-skeleton-base, var(--color-menthe))",
      }}
    />
  );
}

export default function CardParcelleSkeleton() {
  return (
    <article className="card" style={{ overflow: "hidden" }} aria-hidden="true">
      <div
        className="skeleton-shimmer"
        style={{
          width: "100%",
          aspectRatio: "4 / 3",
          backgroundColor: "var(--color-skeleton-base, var(--color-menthe))",
        }}
      />
      <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <Bloc width="45%" />
        <Bloc width="80%" height="17px" />
        <Bloc width="60%" height="14px" />
        <div style={{ display: "flex", gap: "6px" }}>
          <Bloc width="50px" height="18px" />
          <Bloc width="70px" height="18px" />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "4px" }}>
          <Bloc width="100px" height="18px" />
          <Bloc width="60px" height="14px" />
        </div>
      </div>
    </article>
  );
}
