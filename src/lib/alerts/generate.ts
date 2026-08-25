import "server-only";

import {
  describeFriends,
  doorsDedupeKey,
  friendDedupeKey,
  friendLabel,
  groupOverlapsByGig,
  type Overlap,
} from "@/lib/alerts/phrasing";
import type { createClient } from "@/lib/supabase/server";

/**
 * Turn things the app already knows into alerts.
 *
 * The alerts table has existed since migration 0004 and nothing has ever
 * written to it, so the bell in the nav led to a page that could only be
 * empty. Three of the four original alert kinds — on_sale, price_drop,
 * tour_announce — need a live events feed that does not exist yet. These two
 * need nothing external:
 *
 *   doors_tonight  your own wallet says you are out tonight
 *   friend_going   someone in your inner circle has the same gig in theirs
 *
 * Design notes worth keeping:
 *
 * - **Runs as the user, not as the service role.** `alerts` is owner-only
 *   RLS, so the user inserting their own alerts needs no elevated client.
 *   Nothing here can see or write another account's data even if the logic is
 *   wrong.
 *
 * - **The friend rule is not re-implemented.** It comes from the
 *   `who_else_going` RPC, which already encodes "future overlaps require
 *   mutual Inner Circle membership". Restating that rule here would be a
 *   second place for it to drift, and privacy rules that exist twice end up
 *   disagreeing.
 *
 * - **Idempotent by construction.** `dedupe_key` plus a unique index means a
 *   second scan inserts nothing. That is what makes it safe to run on app
 *   open rather than needing a scheduler — and GitHub Actions `schedule` is
 *   not a reliable cron anyway.
 *
 * - **Fails silently and completely.** An alert is a nice-to-have; a page that
 *   500s because a migration has not been applied yet is not. Everything is
 *   wrapped, and a failure logs rather than throws.
 *
 * Note this makes alerts appear when the app is OPENED. Delivering them to a
 * lock screen is push, which needs a native plugin and a fresh iOS/Android
 * build — see the parity rules in CLAUDE.md.
 */

/**
 * Derived from the app's own factory rather than SupabaseClient<Database>:
 * @supabase/ssr's server client is a distinct type, and annotating it with the
 * generic one collapses every table to `never`.
 */
type Client = Awaited<ReturnType<typeof createClient>>;

/** How often a user's wallet is rescanned. */
const SCAN_INTERVAL_MS = 60 * 60 * 1000;

/** How far ahead "tonight" reaches. */
const DOORS_WINDOW_MS = 24 * 60 * 60 * 1000;

type NewAlert = {
  user_id: string;
  kind: "doors_tonight" | "friend_going";
  title: string;
  body: string | null;
  event_at: string | null;
  dedupe_key: string;
};

/**
 * Generate any missing alerts for one user. Safe to call on every request —
 * it no-ops unless the last scan was over an hour ago.
 *
 * Returns the number of alerts inserted, for logging and tests.
 */
export async function generateAlerts(
  supabase: Client,
  userId: string,
  opts: { force?: boolean } = {},
): Promise<number> {
  try {
    if (!opts.force && !(await dueForScan(supabase, userId))) return 0;

    const candidates = [
      ...(await doorsTonight(supabase, userId)),
      ...(await friendsGoing(supabase, userId)),
    ];

    await markScanned(supabase, userId);
    if (candidates.length === 0) return 0;

    // Insert one at a time. A batch insert is rejected wholesale when any row
    // collides with the dedupe index, and a collision is the normal case here
    // — it means the alert already exists.
    let inserted = 0;
    for (const alert of candidates) {
      const { error } = await supabase.from("alerts").insert(alert as never);
      if (!error) {
        inserted += 1;
      } else if (error.code !== "23505") {
        // 23505 is the dedupe index doing its job. Anything else is worth
        // seeing — a missing column means migration 0017 has not been applied.
        console.error("[alerts] insert failed", error.code, error.message);
        return inserted;
      }
    }
    return inserted;
  } catch (err) {
    console.error("[alerts] generation failed", err);
    return 0;
  }
}

async function dueForScan(supabase: Client, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("last_alert_scan_at")
    .eq("id", userId)
    .single();

  // Column missing (migration not applied) — skip quietly rather than
  // scanning on every single navigation.
  if (error) return false;

  const last = data?.last_alert_scan_at;
  if (!last) return true;
  return Date.now() - new Date(last).getTime() > SCAN_INTERVAL_MS;
}

async function markScanned(supabase: Client, userId: string) {
  await supabase
    .from("profiles")
    .update({ last_alert_scan_at: new Date().toISOString() } as never)
    .eq("id", userId);
}

/** Gigs in the user's own wallet starting within the next 24 hours. */
async function doorsTonight(
  supabase: Client,
  userId: string,
): Promise<NewAlert[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + DOORS_WINDOW_MS);

  const { data } = await supabase
    .from("wallet_items")
    .select("id, title, starts_at, venues(name, city)")
    .eq("user_id", userId)
    .in("status", ["going", "tonight"])
    .gte("starts_at", now.toISOString())
    .lte("starts_at", horizon.toISOString());

  return (data ?? []).map((item) => {
    const venuesRaw = (item as { venues: unknown }).venues;
    const venue = (Array.isArray(venuesRaw) ? venuesRaw[0] : venuesRaw) as {
      name: string | null;
      city: string | null;
    } | null;
    const place = [venue?.name, venue?.city].filter(Boolean).join(", ");

    return {
      user_id: userId,
      kind: "doors_tonight" as const,
      title: item.title,
      body: place ? `Tonight at ${place}.` : "You're out tonight.",
      event_at: item.starts_at,
      dedupe_key: doorsDedupeKey(item.id),
    };
  });
}

/**
 * Inner-circle friends with the same gig in their wallet.
 *
 * The RPC does the authorisation and the overlap matching; this only turns its
 * rows into one alert per gig rather than one per friend, because three
 * separate "someone is going" alerts for the same night is noise.
 */
async function friendsGoing(
  supabase: Client,
  userId: string,
): Promise<NewAlert[]> {
  const { data, error } = await supabase.rpc("who_else_going", {
    target_user: userId,
  });
  if (error) return [];

  const rows = (data ?? []) as Overlap[];

  return [...groupOverlapsByGig(rows).entries()].map(([walletItemId, group]) => ({
    user_id: userId,
    kind: "friend_going" as const,
    title: group[0].title,
    body: describeFriends(group.map(friendLabel)),
    event_at: group[0].starts_at,
    dedupe_key: friendDedupeKey(walletItemId, group.length),
  }));
}
