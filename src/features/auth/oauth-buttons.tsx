"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/**
 * Social sign-in buttons.
 *
 * Each provider must be enabled in Supabase (Authentication → Providers) AND
 * have `https://<ref>.supabase.co/auth/v1/callback` registered as an authorised
 * redirect URI on the provider's own console. A button shown for a provider
 * that isn't fully wired is worse than no button: the user gets
 * "Unsupported provider: provider is not enabled" and assumes the app is broken.
 *
 * Verified against production 2026-07-28:
 *   google → enabled, redirects correctly
 *   apple  → NOT enabled, returns "Unsupported provider"
 *
 * Flip a flag to true only once you've confirmed that provider completes a real
 * round trip, not merely that it exists in the Supabase dashboard.
 */
export const ENABLED_PROVIDERS = {
  google: true,
  apple: false,
} as const;

export type OAuthProvider = keyof typeof ENABLED_PROVIDERS;

const LABELS: Record<OAuthProvider, string> = {
  google: "Google",
  apple: "Apple",
};

export function OAuthButtons({
  onSelect,
  verb,
}: {
  onSelect: (provider: OAuthProvider) => void;
  verb: "Sign in" | "Sign up";
}) {
  const available = (
    Object.keys(ENABLED_PROVIDERS) as OAuthProvider[]
  ).filter((p) => ENABLED_PROVIDERS[p]);

  if (available.length === 0) return null;

  return (
    <>
      <div
        className={
          available.length === 1 ? "grid grid-cols-1" : "grid grid-cols-2 gap-2"
        }
      >
        {available.map((p) => (
          <Button
            key={p}
            type="button"
            variant="outline"
            aria-label={`${verb} with ${LABELS[p]}`}
            onClick={() => onSelect(p)}
          >
            Continue with {LABELS[p]}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or email</span>
        <Separator className="flex-1" />
      </div>
    </>
  );
}
