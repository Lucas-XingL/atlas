export default function AtlasTabLoading() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="space-y-6">
        <div className="h-6 w-32 animate-pulse rounded bg-muted/60" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="h-24 animate-pulse rounded-lg border border-border/60 bg-card/40" />
          <div className="h-24 animate-pulse rounded-lg border border-border/60 bg-card/40" />
          <div className="h-24 animate-pulse rounded-lg border border-border/60 bg-card/40" />
        </div>
        <div className="h-40 animate-pulse rounded-lg border border-border/60 bg-card/40" />
      </div>
    </div>
  );
}
