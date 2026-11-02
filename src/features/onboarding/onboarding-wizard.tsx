"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Camera,
  Check,
  Music,
  ScanLine,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GigTrotterGlyph } from "@/components/brand";
import { updateProfile } from "@/features/profile/edit-actions";

// Two steps, not three: the welcome tour used to sit in front of the name
// step, so the first useful thing (a gig, a ticket) was three screens away.
// The name is still required (/app bounces nameless accounts back here), so
// it is the first screen, with the pitch folded in beside it.
const STEPS = [
  { label: "Your name", icon: Check },
  { label: "Get started", icon: ArrowRight },
] as const;

export function OnboardingWizard({
  currentName,
  currentUsername,
  next = null,
}: {
  currentName: string | null;
  currentUsername: string;
  /** Where the person was heading before they signed up (an event, say). */
  next?: string | null;
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
          // Required, not optional: /app sends anyone with an empty wallet and
          // no display name here, so saving null meant "Skip — I'll explore
          // first" landed on /app and was bounced straight back to step 0
          // with nothing on screen explaining why. The Continue button below
          // now requires a name, which is what makes the redirect terminate.
          display_name: displayName.trim(),
          username: username.trim(),
        });
        setStep(1);
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
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <GigTrotterGlyph className="h-10 w-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              What should we call you?
            </h1>
            <p className="text-sm text-muted-foreground">
              One step and you are in: find a gig, or drop in a ticket. Friends find you by this name; change it any time in settings.
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
            disabled={pending || !username.trim() || !displayName.trim()}
          >
            {pending ? "Saving..." : "Continue"}
            <ArrowRight className="transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary/10">
            <Check className="h-8 w-8 text-secondary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              You&apos;re in{displayName ? `, ${displayName.split(" ")[0]}` : ""}.
            </h1>
            <p className="text-muted-foreground">
              {next
                ? "Pick up where you left off, or start with a ticket."
                : "Start with the gig you are going to next, or the ticket already on your phone."}
            </p>
          </div>
          <div className="mx-auto grid max-w-md gap-3">
            {next ? (
              <StartCard
                icon={Music}
                title="Back to what you were looking at"
                desc="The event you opened before signing up."
                href={next}
                primary
                onClick={() => router.push(next)}
              />
            ) : null}
            <StartCard
              icon={Music}
              title="Find a gig"
              desc="Browse what is on, save it, see who else is going."
              href="/app/events"
              primary={!next}
              onClick={() => router.push("/app/events")}
            />
            <StartCard
              icon={ScanLine}
              title="Add a ticket you already have"
              desc="Drop in a screenshot of the ticket; it is read and goes in your wallet."
              href="/app/capture"
              onClick={() => router.push("/app/capture")}
            />
            <StartCard
              icon={Camera}
              title="Add old tickets in bulk"
              desc="Pick the ticket screenshots already on your phone and your map fills in."
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
