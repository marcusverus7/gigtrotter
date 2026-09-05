/**
 * The wallet item lifecycle, as one pure rule.
 *
 *   wishlist  no ticket, or no date — never moves on its own
 *   going     ticket in hand, gig more than 12h away
 *   tonight   doors within 12h, or the gig is on right now
 *   attended  the gig has ended
 *   archived  the user's own choice — never set or cleared automatically
 *
 * Migration 0002 promised "status flips via trigger as time passes" and no
 * trigger, cron or action ever did it: every item kept the status it was
 * born with, so a ticket confirmed a month early said "Going" forever, the
 * Past tab showed "Going" badges, and a gig that came and went without a
 * geofence tap never became a pin. This file is the rule; reconcile.ts
 * applies it hourly; the insert paths use it so an item is born correct.
 *
 * No `server-only` — tested in eval/logic.test.ts.
 */

import type { WalletStatus } from "@/lib/supabase/types";

/** "Tonight" starts this far before doors. */
export const TONIGHT_WINDOW_MS = 12 * 3600 * 1000;

/** A gig with no end time is over this long after it starts. */
export const DEFAULT_DURATION_MS = 4 * 3600 * 1000;

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/** When the gig is over, as a timestamp. */
export function effectiveEnd(startsAt: string, endsAt: string | null | undefined): number {
  const start = ms(startsAt) ?? 0;
  const end = ms(endsAt);
  return end != null && end >= start ? end : start + DEFAULT_DURATION_MS;
}

/** The status an item WITH a ticket should have right now. */
export function deriveStatus(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  now: number = Date.now(),
): "wishlist" | "going" | "tonight" | "attended" {
  const start = ms(startsAt);
  if (start == null) return "wishlist";
  if (effectiveEnd(startsAt!, endsAt) < now) return "attended";
  if (start - now < TONIGHT_WINDOW_MS) return "tonight";
  return "going";
}

/**
 * What the hourly reconciler should set, or null to leave the row alone.
 * Only ever moves FORWARD (going -> tonight -> attended): a wishlist item
 * has no ticket, an archived item was the user's call, and an attended item
 * stays attended even if a date edit makes it future again — that path
 * re-derives explicitly rather than relying on this.
 */
export function nextStatus(
  current: WalletStatus,
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  now: number = Date.now(),
): WalletStatus | null {
  if (current !== "going" && current !== "tonight") return null;
  const derived = deriveStatus(startsAt, endsAt, now);
  if (derived === "wishlist") return null; // undated: nothing to advance
  if (derived === current) return null;
  if (current === "tonight" && derived === "going") return null; // never backwards
  return derived;
}
