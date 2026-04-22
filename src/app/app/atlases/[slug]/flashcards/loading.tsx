export default function FlashcardsLoading() {
  return (
    <div className="mx-auto max-w-4xl px-8 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-5 w-48 animate-pulse rounded bg-muted/60" />
        <div className="h-8 w-20 animate-pulse rounded bg-muted/60" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-lg border border-border/60 bg-card/40"
          />
        ))}
      </div>
    </div>
  );
}
