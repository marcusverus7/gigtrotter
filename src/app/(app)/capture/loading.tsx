import { Skeleton } from "@/components/ui/skeleton";

export default function CaptureLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64" />
      </header>
      <Skeleton className="h-48 w-full rounded-xl border border-dashed" />
      <div className="space-y-3 rounded-xl border border-border bg-card/40 p-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-card/40 p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
    </div>
  );
}
