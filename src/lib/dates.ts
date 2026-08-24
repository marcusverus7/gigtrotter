/**
 * Date helpers shared by the capture confirm card and the wallet.
 *
 * These live outside the components on purpose. Every one of them encodes a
 * rule that was wrong in the UI at some point — a timezone assumption, a
 * placeholder end time rendered as a real one — and a rule in a component is a
 * rule nothing can test.
 *
 * No zod, no "server-only": both a client component and the test runner import
 * this.
 */

/** True when the string already carries a UTC marker or a numeric offset. */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * `<input type="datetime-local">` gives back local wall-clock time
 * ("2026-09-14T19:30"). Appending "Z" to that claims 19:30 local IS 19:30 UTC,
 * and since the value is read straight back out for display, every save shifted
 * the time by another offset. Parse it as local — which is what the spec says
 * an offsetless date-time means — and ask for the real instant.
 */
export function fromLocalDT(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/**
 * Anchor the parser's offsetless wall-clock string to the viewer's timezone.
 *
 * The vision prompt tells the model to drop timezones, so a parse yields
 * "2026-09-14T19:30:00". Left alone that reaches a `timestamptz` column and is
 * resolved against the SERVER's zone — UTC on Vercel — which silently moves
 * every British summer gig an hour earlier. The ticket was read in the
 * viewer's zone, so that is the zone the wall-clock time belongs to.
 *
 * Anything already carrying an offset is returned untouched.
 */
export function anchorToLocalZone(value: string | null | undefined): string {
  if (!value) return "";
  if (HAS_OFFSET.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

/**
 * Decide whether an end time is worth showing next to a start time, and
 * whether it needs its own date.
 *
 * Parsers routinely emit `ends_at === starts_at` as a placeholder, and a range
 * from a time to itself is worse than no range. A genuinely later end on the
 * same day needs only a time; one that lands on another day — a hotel stay, an
 * overnight flight — needs the full date.
 */
export function endDisplay(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): { show: false } | { show: true; sameDay: boolean; end: Date } {
  if (!startsAt || !endsAt) return { show: false };
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { show: false };
  }
  if (end <= start) return { show: false };
  return { show: true, sameDay: end.toDateString() === start.toDateString(), end };
}
