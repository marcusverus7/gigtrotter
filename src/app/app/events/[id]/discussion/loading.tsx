export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="h-8 w-24 animate-pulse rounded bg-muted" />
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="space-y-4 p-6">
          <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-px bg-border" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
