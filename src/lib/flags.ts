/**
 * Launch flags. A plain module on purpose: importing a value from a
 * "use client" file into a server component yields a client REFERENCE, not
 * the value — so `if (!SHOW_UNLAUNCHED)` in a page was testing an object and
 * never redirected. Typecheck cannot catch that; a browser can.
 */

/** Flip to true to preview every flagged surface at once (dev convenience). */
export const SHOW_UNLAUNCHED = false;

/**
 * Flagged routes that have graduated: real data behind them, shown to
 * everyone. Launching a surface is adding its href here — the mobile menu
 * derives from the same list, so phones get it in the same deploy.
 * Marketplace and Merch stay hidden until payment rails are real.
 */
export const LAUNCHED_FLAGGED = new Set(["/app/events", "/app/import"]);

/** True when a flagged route should be served at all. */
export function isLaunched(href: string): boolean {
  return SHOW_UNLAUNCHED || LAUNCHED_FLAGGED.has(href);
}
