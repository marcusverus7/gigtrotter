"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Surface OAuth callback errors.
  searchParams.then((p: { error?: string; detail?: string }) => {
    if (p.error && !error) {
      setError(p.detail ? `Sign-in failed: ${p.detail}` : "Sign-in failed. Try again.");
    }
  });

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/app");
      router.refresh();
    });
  }

  async function signInWithProvider(provider: "google" | "apple") {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/app`,
      },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          aria-label="Sign in with Google"
          onClick={() => signInWithProvider("google")}
        >
          Google
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-label="Sign in with Apple"
          onClick={() => signInWithProvider("apple")}
        >
          Apple
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or email</span>
        <Separator className="flex-1" />
      </div>
      <form onSubmit={signInWithEmail} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        <button
          type="button"
          onClick={() => {
            if (!email.trim()) {
              setError("Enter your email first.");
              return;
            }
            setError(null);
            startTransition(async () => {
              const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/callback?next=/app/settings`,
              });
              if (error) setError(error.message);
              else setError("Check your inbox for a password reset link.");
            });
          }}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Forgot password?
        </button>
      </form>
    </div>
  );
}
