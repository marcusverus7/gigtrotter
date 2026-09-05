import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type { WalletKind, WalletStatus } from "@/lib/supabase/types";
import { DEFAULT_DURATION_MS, TONIGHT_WINDOW_MS, nextStatus } from "@/lib/wallet/lifecycle";

/**
 * Advance wallet items through their lifecycle and mint the pins for gigs
 * that have passed.
 *
 * Runs as the user (owner-only RLS on both tables), from the same hourly
 * slot as alert generation, so it costs one select and at most three writes
 * per user per hour. Idempotent: an item is only touched when its status
 * should change, and a pin is only minted when none exists.
 *
 * Why the pin is minted here: the map, memories, year-in-review, venue
 * stats and the achievements view all read `experiences`, and until now a
 * gig captured as upcoming only became one if the user tapped the geofence
 * button at the venue or answered the morning-after prompt. Most did
 * neither, and the "wallet becomes memories" loop never closed.
 */

type Client = Awaited<ReturnType<typeof createClient>>;

type Candidate = {
  id: string;
  status: WalletStatus;
  kind: WalletKind;
  title: string;
  subtitle: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue_id: string | null;
  capture_id: string | null;
  experiences: { id: string }[] | { id: string } | null;
};

const hasPin = (c: Candidate) =>
  Array.isArray(c.experiences) ? c.experiences.length > 0 : c.experiences != null;

export async function reconcileWalletLifecycle(
  supabase: Client,
  userId: string,
): Promise<{ advanced: number; minted: number }> {
  const now = Date.now();
  // Anything that could move: going/tonight items whose doors are within the
  // tonight window or already behind us. Future items outside it stay going.
  const { data, error } = await supabase
    .from("wallet_items")
    .select(
      "id, status, kind, title, subtitle, starts_at, ends_at, venue_id, capture_id, experiences(id)",
    )
    .eq("user_id", userId)
    .in("status", ["going", "tonight"])
    .not("starts_at", "is", null)
    .lte("starts_at", new Date(now + TONIGHT_WINDOW_MS).toISOString())
    .limit(500);
  if (error || !data) {
    if (error) console.error("[wallet] reconcile select failed", error.message);
    return { advanced: 0, minted: 0 };
  }

  const toTonight: string[] = [];
  const toAttended: Candidate[] = [];
  for (const row of data as unknown as Candidate[]) {
    const next = nextStatus(row.status, row.starts_at, row.ends_at, now);
    if (next === "tonight") toTonight.push(row.id);
    else if (next === "attended") toAttended.push(row);
  }

  let advanced = 0;
  if (toTonight.length > 0) {
    const { data: done } = await supabase
      .from("wallet_items")
      .update({ status: "tonight" })
      .in("id", toTonight)
      .eq("user_id", userId)
      .select("id");
    advanced += done?.length ?? 0;
  }
  if (toAttended.length > 0) {
    const { data: done } = await supabase
      .from("wallet_items")
      .update({ status: "attended" })
      .in(
        "id",
        toAttended.map((c) => c.id),
      )
      .eq("user_id", userId)
      .select("id");
    advanced += done?.length ?? 0;
  }

  const minted = await mintMissingPins(
    supabase,
    userId,
    toAttended.filter((c) => !hasPin(c)),
  );
  return { advanced, minted };
}

/**
 * Create the experience row for attended items that have none. A ticket
 * capture is evidence the user was there ("ticket"); a manual or feed item
 * is not ("none"), which keeps the achievements view honest — it counts only
 * verified pins.
 */
export async function mintMissingPins(
  supabase: Client,
  userId: string,
  items: Pick<
    Candidate,
    "id" | "kind" | "title" | "subtitle" | "starts_at" | "ends_at" | "venue_id" | "capture_id"
  >[],
): Promise<number> {
  const rows = items
    .filter((c) => c.starts_at)
    .map((c) => ({
      user_id: userId,
      wallet_item_id: c.id,
      capture_id: c.capture_id,
      venue_id: c.venue_id,
      kind: c.kind,
      title: c.title,
      subtitle: c.subtitle,
      starts_at: c.starts_at!,
      ends_at:
        c.ends_at ??
        new Date(new Date(c.starts_at!).getTime() + DEFAULT_DURATION_MS).toISOString(),
      audience: "inner" as const,
      verified_by: (c.capture_id ? "ticket" : "none") as "ticket" | "none",
    }));
  if (rows.length === 0) return 0;
  const { data, error } = await supabase.from("experiences").insert(rows).select("id");
  if (error) {
    console.error("[wallet] pin mint failed", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
