"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Camera,
  Check,
  Forward,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GigTrotterGlyph } from "@/components/brand";
import { updateProfile } from "@/features/profile/edit-actions";

const STEPS = [
  { label: "Welcome", icon: Sparkles },
  { label: "Your name", icon: Check },
  { label: "Get started", icon: ArrowRight },
] as const;

export function OnboardingWizard({
  currentName,
  currentUsername,
}: {
  currentName: string | null;
  currentUsername: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(currentName ?? "");
  const [username, setUsername] = useState(currentUsername);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function saveAndNext() {
    setError(null);
    startTransition(async () => {
      try {
        await updateProfile({
          display_name: displayName.trim() || null,
          username: username.trim(),
        });
        setStep(2);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s.label}
            className={`h-2 rounded-full transition-all ${
              i === step
                ? "w-8 bg-primary"
                : i < step
                  ? "w-2 bg-primary/60"
                  : "w-2 bg-muted"
            }`}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
            <GigTrotterGlyph className="h-12 w-10" />
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">
              Where your journey lives.
            </h1>
            <p className="mx-auto max-w-md text-muted-foreground">
              Your tickets, flights and bookings live here — and every one
              quietly becomes a pin on a private map of your life.
            </p>
          </div>
          <div className="mx-auto grid max-w-sm gap-3 text-left">
            <Feature
              icon={ScanLine}
              title="Screenshot capture"
              desc="Share any ticket — AI extracts the details."
            />
            <Feature
              icon={Forward}
              title="Email forwarding"
              desc="Forward confirmations to your personal address."
            />
            <Feature
              icon={ShieldCheck}
              title="Privacy-first"
              desc="Per-pin audiences. Future events hidden by default."
            />
          </div>
          <Button size="lg" className="group" onClick={() => setStep(1)}>
            Let&apos;s go
            <ArrowRight className="transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              How should we call you?
            </h1>
            <p className="text-sm text-muted-foreground">
              This is how friends find you. Change it any time in settings.
            </p>
          </div>
          <div className="mx-auto max-w-sm space-y-4 text-left">
            <div className="space-y-1.5">
              <Label htmlFor="ob-name">Display name</Label>
              <Input
                id="ob-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Mark Loughran"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-user">Username</Label>
              <Input
                id="ob-user"
                value={username}
                onChange={(e) =>
                  setUsername(
                    e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                  )
                }
                placeholder="markl"
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, underscores.
              </p>
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <Button
            size="lg"
            className="group"
            onClick={saveAndNext}
            disabled={pending || !username.trim()}
          >
            {pending ? "Saving..." : "Continue"}
            <ArrowRight className="transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary/10">
            <Check className="h-8 w-8 text-secondary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              You&apos;re in{displayName ? `, ${displayName.split(" ")[0]}` : ""}.
            </h1>
            <p className="text-muted-foreground">
              Pick your starting move — capture your first item, or backfill
              years of history from your camera roll.
            </p>
          </div>
          <div className="mx-auto grid max-w-md gap-3">
            <StartCard
              icon={ScanLine}
              title="Capture your first item"
              desc="Drop a screenshot or forward an email."
              href="/app/capture"
              primary
              onClick={() => router.push("/app/capture")}
            />
            <StartCard
              icon={Camera}
              title="Backfill from camera roll"
              desc="Scan years of ticket screenshots in minutes."
              href="/app/capture/backfill"
              onClick={() => router.push("/app/capture/backfill")}
            />
            <button
              onClick={() => router.push("/app")}
              className="mt-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Skip — I&apos;ll explore first
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card/40 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function StartCard({
  icon: Icon,
  title,
  desc,
  primary,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  href: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-4 rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 ${
        primary
          ? "border-primary/40 bg-primary/5 hover:shadow-[0_12px_40px_-10px_rgba(124,58,237,0.3)]"
          : "border-border bg-card/40 hover:border-primary/30"
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          primary ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </button>
  );
}
