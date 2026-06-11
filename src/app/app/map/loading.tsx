import { Skeleton } from "@/components/ui/skeleton";

export default function MapLoading() {
  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-5 w-16" />
      </header>
      <Skeleton className="aspect-[16/9] w-full rounded-xl" />
    </div>
  );
}
