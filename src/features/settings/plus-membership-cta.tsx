"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useNativeApp } from "@/lib/platform/use-native-app";

/**
 * Pricing + sign-up steering for GigTrotter+.
 *
 * Apple (Guideline 3.1.1) and Google forbid steering users to external
 * (web/Stripe) payment for a digital subscription from inside the app shell.
 * GigTrotter+ is a perks club, so the perks *list* stays visible on every
 * platform — only the pricing block and the join CTA (the steering surface) are
 * hidden inside the native shell. "View live perks" is informational and stays.
 *
 * When StoreKit / Play Billing is wired, replace the hidden branch with a real
 * native in-app-purchase button instead of nothing.
 */
export function PlusMembershipCta() {
  const { isNativeApp } = useNativeApp();

  return (
    <div className="space-y-4">
      {!isNativeApp && (
        <div className="rounded-md border border-border bg-background/50 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Pricing TBD in private beta.</p>
          <p className="mt-1">
            We&apos;ll set the price once we&apos;ve signed enough partner perks
            to justify it. Until then, every account is on free. The wallet, the
            map, the year-in-review, capture — all of it stays free, always.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!isNativeApp && (
          <Button asChild size="sm" variant="outline" disabled>
            <span>Join the waitlist (V1)</span>
          </Button>
        )}
        <Button asChild size="sm" variant="ghost">
          <Link href="/app/perks">View live perks</Link>
        </Button>
      </div>
    </div>
  );
}
