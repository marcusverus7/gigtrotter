import Link from "next/link";

import { GigTrotterMark } from "@/components/brand";
import { LoginForm } from "@/features/auth/login-form";
import { isSupabaseConfigured } from "@/lib/env";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[70vh] w-[70vh] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute right-[-10%] bottom-[-10%] h-[50vh] w-[50vh] rounded-full bg-secondary/15 blur-[120px]" />
      </div>
      <header className="container py-6">
        <Link href="/">
          <GigTrotterMark />
        </Link>
      </header>
      <div className="container flex flex-1 items-center justify-center pb-20">
        <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border/60 bg-card/40 p-8 backdrop-blur-xl">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground">
              Your map is waiting.
            </p>
          </div>
          {isSupabaseConfigured ? (
            <LoginForm searchParams={searchParams} />
          ) : (
            <UnconfiguredNotice />
          )}
          <p className="text-center text-sm text-muted-foreground">
            No account yet?{" "}
            <Link
              href="/signup"
              className="font-medium text-primary hover:underline"
            >
              Make one
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function UnconfiguredNotice() {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
      Supabase isn&apos;t configured for this environment. Set
      <code className="mx-1 font-mono text-xs text-foreground">
        NEXT_PUBLIC_SUPABASE_URL
      </code>
      and
      <code className="mx-1 font-mono text-xs text-foreground">
        NEXT_PUBLIC_SUPABASE_ANON_KEY
      </code>
      in <code className="font-mono text-xs text-foreground">.env.local</code>{" "}
      to enable sign-in.
    </div>
  );
}
