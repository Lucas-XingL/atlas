export function AtlasHeader({
  atlas,
}: {
  atlas: { name: string; thesis: string | null };
}) {
  return (
    <header className="border-b border-border/60 px-8 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Atlas
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{atlas.name}</h1>
        {atlas.thesis ? (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {atlas.thesis}
          </p>
        ) : null}
      </div>
    </header>
  );
}
