import Link from "next/link";

import { GigTrotterMark } from "@/components/brand";
import { SignupForm } from "@/features/auth/signup-form";
import { isSupabaseConfigured } from "@/lib/env";

export default function SignupPage() {
  return (
    <main className="bg-aurora flex min-h-screen flex-col">
      <header className="container py-6">
        <Link href="/">
          <GigTrotterMark />
        </Link>
      </header>
      <div className="container flex flex-1 items-center justify-center pb-20">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight">
              Make your map
            </h1>
            <p className="text-sm text-muted-foreground">
              Capture tonight&apos;s ticket and the years before it.
            </p>
          </div>
          {isSupabaseConfigured ? (
            <SignupForm />
          ) : (
            <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Configure Supabase first — see <code>.env.example</code>.
            </p>
          )}
          <p className="text-center text-xs text-muted-foreground">
            By signing up you agree to the{" "}
            <Link href="/privacy" className="underline">
              privacy promise
            </Link>{" "}
            — your life, your map, your terms.
          </p>
        </div>
      </div>
    </main>
  );
}
