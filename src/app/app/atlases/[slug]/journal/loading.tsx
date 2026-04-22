export default function JournalLoading() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10 space-y-8">
      <div className="h-24 animate-pulse rounded-lg border border-border/60 bg-card/40" />
      <div className="h-9 w-32 animate-pulse rounded bg-muted/60" />
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg border border-border/60 bg-card/40"
          />
        ))}
      </div>
    </div>
  );
}
