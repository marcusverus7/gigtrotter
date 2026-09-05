import "server-only";

import {
  describeFriends,
  describeNewDates,
  doorsDedupeKey,
  eventPlaceLine,
  followedAtIndex,
  friendDedupeKey,
  friendLabel,
  groupNewDatesByArtist,
  groupOverlapsByGig,
  onSaleDedupeKey,
  tourDedupeKey,
  type FeedDate,
  type Overlap,
} from "@/lib/alerts/phrasing";
import { pgTextArray } from "@/lib/supabase/filters";
import type { createClient } from "@/lib/supabase/server";
import { reconcileWalletLifecycle } from "@/lib/wallet/reconcile";

/**
 * Turn things the app already knows into alerts.
 *
 * The alerts table has existed since migration 0004 and nothing wrote to it
 * until 0017, so the bell in the nav led to a page that could only be empty.
 * Two kinds need nothing external:
 *
 *   doors_tonight  your own wallet says you are out tonight
 *   friend_going   someone in your inner circle has the same gig in theirs
 *
 * Two more ride on the events feed (migration 0021, nightly cron):
 *
 *   tour_announce  a followed artist has dates the feed first saw after you
 *                  followed them — one alert per artist per announcement
 *   on_sale        tickets for a followed artist or venue go on sale this week
 *
 * price_drop still has no source and is never raised.
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
  kind: "doors_tonight" | "friend_going" | "tour_announce" | "on_sale";
  title: string;
  body: string | null;
  url?: string | null;
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

    // Advance wallet statuses first (going -> tonight -> attended, minting
    // pins for gigs that passed) so the candidates below read the truth.
    // Same hourly slot, same user-scoped client; see lib/wallet/reconcile.ts.
    await reconcileWalletLifecycle(supabase, userId);

    const candidates = [
      ...(await doorsTonight(supabase, userId)),
      ...(await friendsGoing(supabase, userId)),
      ...(await feedAlerts(supabase, userId)),
    ];

    await markScanned(supabase, userId);
    if (candidates.length === 0) return 0;

    // One upsert, one round trip. ignoreDuplicates compiles to
    // ON CONFLICT DO NOTHING against the dedupe index, which is exactly the
    // semantics the old row-at-a-time loop existed to get — and this runs on
    // the layout's critical path on the navigations where it fires.
    const { data, error } = await supabase
      .from("alerts")
      .upsert(candidates as never, {
        onConflict: "user_id,dedupe_key",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) {
      // A missing column/kind means migration 0017 has not been applied.
      console.error("[alerts] upsert failed", error.code, error.message);
      return 0;
    }
    return data?.length ?? 0;
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

/**
 * tour_announce and on_sale — the two kinds that waited on the events feed.
 *
 * Runs as the user: events is public-read for approved rows, and follows /
 * wishlist are owner-scoped, so nothing here needs elevation. The queries are
 * driven by what the user follows or wishlists; a user following nothing
 * costs two indexed selects that return empty.
 *
 * event_at carries the meaningful instant (gig date, or the on-sale moment)
 * and the Alerts page renders it client-side, so no time-of-day is ever baked
 * into body text in the server's timezone.
 */
async function feedAlerts(supabase: Client, userId: string): Promise<NewAlert[]> {
  const [{ data: follows }, { data: wishes }] = await Promise.all([
    supabase.from("follows").select("kind, name, created_at").eq("user_id", userId).limit(500),
    supabase.from("wishlist").select("kind, name, created_at").eq("user_id", userId).limit(500),
  ]);
  const interests = [...(follows ?? []), ...(wishes ?? [])];
  const artistNames = [
    ...new Set(
      interests
        .filter((f) => f.kind === "artist")
        .map((f) => f.name.trim())
        .filter(Boolean),
    ),
  ];
  const venueNames = [
    ...new Set(
      interests
        .filter((f) => f.kind === "venue")
        .map((f) => f.name.trim())
        .filter(Boolean),
    ),
  ];
  if (artistNames.length === 0 && venueNames.length === 0) return [];

  const nowIso = new Date().toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const weekAhead = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const out: NewAlert[] = [];
  const seen = new Set<string>();

  type FeedEventRow = {
    id: string;
    title: string;
    headliner: string | null;
    venue_name: string | null;
    venue_city: string | null;
    starts_at: string | null;
    on_sale_at: string | null;
    external_url: string | null;
  };
  const cols = "id, title, headliner, venue_name, venue_city, starts_at, on_sale_at, external_url";

  // tour_announce: a followed artist has a date the feed first saw AFTER the
  // follow (and within the last week). Both cuts matter — see
  // groupNewDatesByArtist for the backfill storm the follow-time cut prevents.
  // The query pre-filters on the oldest follow so a long-time follower does
  // not pull the whole week; the per-artist rule is applied in code.
  const followedAt = followedAtIndex(interests);
  if (followedAt.size > 0) {
    const oldestFollow = [...followedAt.values()].sort()[0];
    const since = oldestFollow > weekAgo ? oldestFollow : weekAgo;
    const { data } = await supabase
      .from("events")
      .select(`${cols}, artist_names, created_at`)
      .overlaps("artist_names", pgTextArray(artistNames))
      .gt("created_at", since)
      .gt("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(100);
    for (const g of groupNewDatesByArtist((data ?? []) as FeedDate[], followedAt)) {
      const first = g.dates[0];
      const { title, body } = describeNewDates(g);
      out.push({
        user_id: userId,
        kind: "tour_announce",
        title,
        body,
        url: first.external_url,
        event_at: first.starts_at,
        dedupe_key: tourDedupeKey(g.artistKey, g.newestId),
      });
    }
  }

  // on_sale: tickets for a followed artist or venue go on sale within a week.
  // Soonest first, so the cap keeps the ones that matter this week.
  const onSaleFilters: { column: "artist_names" | "venue_name"; values: string[] }[] = [];
  if (artistNames.length > 0) onSaleFilters.push({ column: "artist_names", values: artistNames });
  if (venueNames.length > 0) onSaleFilters.push({ column: "venue_name", values: venueNames });
  for (const f of onSaleFilters) {
    let q = supabase
      .from("events")
      .select(cols)
      .gte("on_sale_at", nowIso)
      .lte("on_sale_at", weekAhead)
      .order("on_sale_at", { ascending: true })
      .limit(20);
    q =
      f.column === "artist_names"
        ? q.overlaps("artist_names", pgTextArray(f.values))
        : q.in("venue_name", f.values);
    const { data } = await q;
    for (const ev of (data ?? []) as FeedEventRow[]) {
      const key = onSaleDedupeKey(ev.id);
      if (seen.has(key)) continue;
      seen.add(key);
      const place = eventPlaceLine(ev.venue_name, ev.venue_city);
      out.push({
        user_id: userId,
        kind: "on_sale",
        title: ev.title,
        body: place ? `Tickets go on sale soon — ${place}.` : "Tickets go on sale soon.",
        url: ev.external_url,
        event_at: ev.on_sale_at,
        dedupe_key: key,
      });
    }
  }

  return out;
}
