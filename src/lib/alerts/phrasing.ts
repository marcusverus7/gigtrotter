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

/** The slice of an events row the tour grouping needs. */
export type FeedDate = {
  id: string;
  title: string;
  artist_names: string[] | null;
  venue_name: string | null;
  venue_city: string | null;
  starts_at: string | null;
  created_at: string;
  external_url: string | null;
};

const nameKey = (name: string) => name.trim().toLowerCase();
const at = (iso: string) => new Date(iso).getTime();

/**
 * artist name (lower-cased) -> when the user first followed or wishlisted
 * them. The earliest wins when both exist, so re-adding an artist to a
 * wishlist does not make already-known dates "new" again.
 */
export function followedAtIndex(
  rows: { kind: string; name: string; created_at: string }[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.kind !== "artist") continue;
    const key = nameKey(r.name);
    if (!key) continue;
    const prev = out.get(key);
    if (!prev || at(r.created_at) < at(prev)) out.set(key, r.created_at);
  }
  return out;
}

export type NewDatesGroup = {
  /** As spelled on the event, not as the user typed it. */
  artist: string;
  artistKey: string;
  /** Soonest first. */
  dates: FeedDate[];
  /** Most recently created — what the dedupe key rides on. */
  newestId: string;
};

/**
 * "Announced since you followed", one group per artist.
 *
 * Two rules, both learned from the first production sync:
 *
 * 1. Only dates the feed first saw AFTER the follow count. A bulk backfill —
 *    a new provider, a new city — stamps thousands of rows with one
 *    created_at, and a recent created_at is the only signal we have for
 *    "announced". Without the follow-time cut, every follower of any artist
 *    in that batch is told the artist's whole catalogue is new.
 *
 * 2. One alert per artist, however many dates arrived. A twelve-date tour is
 *    one piece of news; twelve cards saying "New date announced" is noise.
 *
 * An event with two followed artists on the bill lands in both groups —
 * that is two pieces of news to two different follows.
 */
export function groupNewDatesByArtist(
  events: FeedDate[],
  followedAt: Map<string, string>,
): NewDatesGroup[] {
  const groups = new Map<string, NewDatesGroup>();
  for (const ev of events) {
    if (!ev.starts_at) continue;
    for (const name of ev.artist_names ?? []) {
      const key = nameKey(name);
      const since = followedAt.get(key);
      if (!since || at(ev.created_at) <= at(since)) continue;
      const g = groups.get(key);
      if (!g) {
        groups.set(key, { artist: name, artistKey: key, dates: [ev], newestId: ev.id });
      } else if (!g.dates.some((d) => d.id === ev.id)) {
        g.dates.push(ev);
      }
    }
  }
  const out = [...groups.values()];
  for (const g of out) {
    g.dates.sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""));
    g.newestId = [...g.dates].sort(
      (a, b) => at(b.created_at) - at(a.created_at) || b.id.localeCompare(a.id),
    )[0].id;
  }
  return out.sort((a, b) => a.artist.localeCompare(b.artist));
}

/** Title and body for a tour_announce alert. */
export function describeNewDates(g: NewDatesGroup): { title: string; body: string } {
  const first = g.dates[0];
  const place = eventPlaceLine(first.venue_name, first.venue_city);
  if (g.dates.length === 1) {
    return {
      title: first.title,
      body: place ? `New date announced — ${place}.` : "New date announced.",
    };
  }
  return {
    title: `${g.artist}: ${g.dates.length} new dates`,
    body: place ? `First up: ${place}.` : `${g.dates.length} dates just announced.`,
  };
}

/**
 * Keyed on the artist and the newest date in the batch: rescanning the same
 * announcement inserts nothing, and a date added later raises one fresh
 * alert rather than repeating the whole list.
 */
export function tourDedupeKey(artistKey: string, newestEventId: string): string {
  return `tour:${artistKey}:${newestEventId}`;
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
