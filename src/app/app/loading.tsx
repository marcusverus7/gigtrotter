import { Skeleton } from "@/components/ui/skeleton";

export default function WalletLoading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-20 rounded-md" />
      </header>

      {/* Morning-after queue placeholder */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`ma-${i}`} className="h-24 w-64 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Throwbacks strip placeholder */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-52" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`tb-${i}`} className="h-20 w-48 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Wallet grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex items-center gap-2 pt-2">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
