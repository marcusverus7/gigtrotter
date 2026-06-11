import Link from "next/link";
import { Globe2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function RootNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="mx-auto max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Globe2 className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">404</h1>
        <p className="text-sm text-muted-foreground">
          This page doesn&apos;t exist. Maybe the journey starts elsewhere.
        </p>
        <Button asChild>
          <Link href="/">Back to GigTrotter</Link>
        </Button>
      </div>
    </div>
  );
}
