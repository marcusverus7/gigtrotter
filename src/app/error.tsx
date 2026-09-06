"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // No <html>/<body> here: Next renders this INSIDE the root layout, which
  // already emits both. Nesting them is invalid DOM — React logs a nesting
  // error and the fallback loses Providers, so the toaster and tooltips it
  // renders alongside stop working. Emitting the document is global-error's
  // job, and that file exists now for crashes in the layout itself.
  return (
    <div
      className="flex min-h-screen items-center justify-center px-6"
      role="alert"
    >
      <div className="mx-auto max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred."}
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground/60">
            ref: {error.digest}
          </p>
        )}
        <div className="flex justify-center gap-2">
          <Button onClick={reset} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <Button asChild size="sm">
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
