"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

import { OAuthButtons, type OAuthProvider } from "./oauth-buttons";

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
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  searchParams.then((p) => {
    if (p.error && !error) {
      setError(
        p.error === "link_invalid"
          ? "That link has expired or was already used. Request a new one below."
          : p.error === "no_credentials"
            ? "That link was incomplete. Request a new one below."
            : "Sign-in failed. Try again.",
      );
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

  async function signInWithProvider(provider: OAuthProvider) {
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
      <OAuthButtons verb="Sign in" onSelect={signInWithProvider} />
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
        {notice ? (
          <p className="text-sm text-emerald-400" role="status">
            {notice}
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
            setNotice(null);
            startTransition(async () => {
              const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
              });
              if (error) setError(error.message);
              // Success used to go through setError too, so "check your
              // inbox" rendered red with role="alert" — testers read it as a
              // failure.
              else setNotice("Check your inbox for a password reset link.");
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
