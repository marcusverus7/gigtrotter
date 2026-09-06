"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

import { OAuthButtons, type OAuthProvider } from "./oauth-buttons";

export function SignupForm() {
  const router = useRouter();
  const supabase = createClient();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [emailSent, setEmailSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const u = username.toLowerCase().trim();
    if (!/^[a-z0-9_]{3,30}$/.test(u)) {
      setError("Username: 3–30 chars, lowercase letters, numbers, underscores.");
      return;
    }
    startTransition(async () => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username: u },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/app/onboarding`,
        },
      });
      if (error) {
        // GoTrue reports a failure inside the handle_new_user trigger as the
        // opaque "Database error saving new user". In practice it is the
        // unique constraint on profiles.username, and the tester has no way
        // to know that — retrying the same username fails identically.
        setError(
          /database error saving new user/i.test(error.message)
            ? "That username is already taken — try another."
            : error.message,
        );
        return;
      }
      if (data.user && !data.session) {
        setEmailSent(true);
        return;
      }
      router.push("/app/onboarding");
      router.refresh();
    });
  }

  async function signUpWithProvider(provider: OAuthProvider) {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/app/onboarding`,
      },
    });
    if (error) setError(error.message);
  }

  if (emailSent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">Check your inbox</h2>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <strong>{email}</strong>. Click it to
          activate your account, then you&apos;ll land straight in onboarding.
        </p>
        <p className="text-xs text-muted-foreground">
          Didn&apos;t get it? Check spam, or{" "}
          <button
            type="button"
            onClick={() => setEmailSent(false)}
            className="underline hover:text-foreground"
          >
            try again
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <OAuthButtons verb="Sign up" onSelect={signUpWithProvider} />
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            placeholder="markl"
            required
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            How friends find you. You also get a randomised anonymous handle for
            your public board.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
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
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
