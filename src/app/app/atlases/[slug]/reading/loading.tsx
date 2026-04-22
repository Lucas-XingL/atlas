export default function ReadingLoading() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-10 space-y-6">
      <div className="h-9 w-40 animate-pulse rounded bg-muted/60" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-lg border border-border/60 bg-card/40"
          />
        ))}
      </div>
    </div>
  );
}
