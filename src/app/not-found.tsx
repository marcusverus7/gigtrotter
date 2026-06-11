import Link from "next/link";

import { Button } from "@/components/ui/button";
import { GigTrotterMark } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="bg-aurora flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <GigTrotterMark className="mb-8" />
      <h1 className="font-mono text-7xl tnum text-primary">404</h1>
      <h2 className="mt-2 text-2xl font-semibold">Lost the pin.</h2>
      <p className="mt-2 max-w-sm text-muted-foreground">
        That page isn&apos;t in the wallet. Maybe the anon board was revoked, or
        the link drifted.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back to the map</Link>
      </Button>
    </main>
  );
}
