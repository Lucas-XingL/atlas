export default function RecommendationsLoading() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-10 space-y-6">
      <div className="flex gap-4">
        <div className="h-8 w-24 animate-pulse rounded bg-muted/60" />
        <div className="h-8 w-24 animate-pulse rounded bg-muted/40" />
        <div className="h-8 w-24 animate-pulse rounded bg-muted/40" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-lg border border-border/60 bg-card/40"
          />
        ))}
      </div>
    </div>
  );
}
