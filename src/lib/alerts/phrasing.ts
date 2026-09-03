/**
 * The pure parts of alert generation — grouping and wording.
 *
 * Split out from `generate.ts` so the test runner can import them: that module
 * is `server-only` and reaches for a Supabase client. Everything here is a
 * function of its arguments.
 */

export type Overlap = {
  wallet_item_id: string;
  title: string;
  starts_at: string;
  friend_display_name: string | null;
  friend_username: string;
};

/**
 * One alert per gig, not one per friend.
 *
 * `who_else_going` returns a row for every (gig, friend) pair, so a night three
 * people are going to would otherwise produce three near-identical alerts.
 */
export function groupOverlapsByGig(rows: Overlap[]): Map<string, Overlap[]> {
  const byGig = new Map<string, Overlap[]>();
  for (const row of rows) {
    const group = byGig.get(row.wallet_item_id);
    if (group) group.push(row);
    else byGig.set(row.wallet_item_id, [row]);
  }
  return byGig;
}

/** Prefer the name someone chose; fall back to their handle. */
export function friendLabel(row: Overlap): string {
  return row.friend_display_name?.trim() || `@${row.friend_username}`;
}

/**
 * "Ana is going too." / "Ana and Bo are going too." /
 * "Ana, Bo and 2 others are going too."
 *
 * Naming everyone gets unreadable past two, and "and 1 others" is the kind of
 * detail that makes an app feel unfinished.
 */
export function describeFriends(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is going too.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are going too.`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} other${
    rest === 1 ? "" : "s"
  } are going too.`;
}

/**
 * Keys the friend alert on the gig AND the number of friends, so a fourth
 * person joining raises a fresh alert while re-scanning the same three does
 * not. Deliberately not keyed on the friend ids: a friend dropping out would
 * otherwise re-alert about a smaller group.
 */
export function friendDedupeKey(walletItemId: string, count: number): string {
  return `friends:${walletItemId}:${count}`;
}

export function doorsDedupeKey(walletItemId: string): string {
  return `doors:${walletItemId}`;
}

// ── feed-driven alerts (tour_announce / on_sale) ────────────────────────────

export function tourDedupeKey(eventId: string): string {
  return `tour:${eventId}`;
}

/**
 * Keyed on the event alone: an on-sale date that gets postponed should not
 * re-alert — the event is still the thing the user was told about.
 */
export function onSaleDedupeKey(eventId: string): string {
  return `onsale:${eventId}`;
}

/** "The Deaf Institute, Manchester" / "Manchester" / null when we know nothing. */
export function eventPlaceLine(
  venueName: string | null,
  city: string | null,
): string | null {
  const parts = [venueName, city].filter((p): p is string => !!p && p.trim() !== "");
  return parts.length ? parts.join(", ") : null;
}
