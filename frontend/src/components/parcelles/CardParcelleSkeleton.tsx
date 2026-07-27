// État de chargement de CardParcelle — même gabarit (photo 180px, corps 12px
// de padding) pour éviter tout saut de mise en page (CLS) à l'arrivée des
// données réelles. Famille Skeleton* (charte de nommage v1 §3.1).

function Bloc({ width, height = "12px" }: { width: string; height?: string }) {
  return (
    <div
      className="skeleton-shimmer"
      style={{
        width,
        height,
        borderRadius: "4px",
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
          height: "180px",
          backgroundColor: "var(--color-skeleton-base, var(--color-menthe))",
        }}
      />
      <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <Bloc width="80%" height="16px" />
        <Bloc width="55%" />
        <div style={{ display: "flex", gap: "6px" }}>
          <Bloc width="50px" height="18px" />
          <Bloc width="70px" height="18px" />
        </div>
        <Bloc width="100%" height="6px" />
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "2px" }}>
          <Bloc width="90px" height="16px" />
          <Bloc width="60px" height="14px" />
        </div>
      </div>
    </article>
  );
}
