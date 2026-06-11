import { Skeleton } from "@/components/ui/skeleton";

export default function NightLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2 text-center">
        <Skeleton className="mx-auto h-8 w-36" />
        <Skeleton className="mx-auto h-4 w-56" />
      </header>
      <div className="space-y-4 rounded-xl border border-border bg-card/40 p-6">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex gap-2 pt-3">
          <Skeleton className="h-10 w-32 rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </div>
    </div>
  );
}
