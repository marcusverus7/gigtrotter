import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6">
      <div className="mx-auto max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Compass className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Off the map</h1>
        <p className="text-sm text-muted-foreground">
          That page doesn&apos;t exist — or it might be a pin we haven&apos;t
          dropped yet.
        </p>
        <Button asChild size="sm">
          <Link href="/app">Back to your wallet</Link>
        </Button>
      </div>
    </div>
  );
}
