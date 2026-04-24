export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6 lg:px-8">
      <div className="mb-5 h-8 w-48 animate-pulse rounded bg-muted/60" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr),minmax(360px,480px)]">
        <div className="h-[620px] animate-pulse rounded-lg border border-border/60 bg-card/30" />
        <div className="h-[620px] animate-pulse rounded-lg border border-border/60 bg-card/40" />
      </div>
    </div>
  );
}
