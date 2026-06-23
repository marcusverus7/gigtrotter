/**
 * Affiliate link infrastructure.
 *
 * affiliateUrl() is a pure, client-safe function. It reads NEXT_PUBLIC_AFFILIATE_*
 * env vars (inlined by Next.js at build time). If the relevant var is empty the
 * raw URL is returned unchanged, so nothing breaks before IDs are configured.
 *
 * Query-param conventions below are placeholders — confirm against each
 * provider's affiliate-program spec before going live.
 *
 * Skiddle:      https://www.skiddle.com/affiliates/
 * Ticketmaster: https://developer.ticketmaster.com/partners/
 * Eventbrite:   https://www.eventbrite.com/l/affiliate-program/
 * Dice:         https://dice.fm/partners  (confirm param name)
 * See Tickets:  https://www.seetickets.com/info/affiliate-program
 */

type AffiliateConfig = {
  /** Env-var value (may be empty string when not configured). */
  id: string;
  /** Query-param name to append (e.g. "aff", "camefrom"). */
  param: string;
};

/** Normalise provider string to a lookup key. */
function normaliseProvider(provider: string): string {
  return provider.toLowerCase().trim();
}

/**
 * Append a query param to a URL string using the URL/URLSearchParams API.
 * Returns rawUrl unchanged if parsing fails or if id is falsy.
 */
function appendParam(rawUrl: string, param: string, id: string): string {
  if (!id) return rawUrl;
  try {
    const u = new URL(rawUrl);
    u.searchParams.set(param, id);
    return u.toString();
  } catch {
    // Malformed URL — pass through unchanged.
    return rawUrl;
  }
}

/**
 * Map of normalised provider name → affiliate config.
 * process.env.NEXT_PUBLIC_* vars are inlined by Next.js at build time, so
 * they are safe to read in client components.
 */
function buildConfig(): Record<string, AffiliateConfig> {
  return {
    skiddle: {
      // Skiddle affiliate docs: append ?affiliate=<id> (placeholder — verify)
      id: process.env.NEXT_PUBLIC_AFFILIATE_SKIDDLE ?? "",
      param: "affiliate",
    },
    ticketmaster: {
      // Ticketmaster affiliate docs: append ?camefrom=<id> (placeholder — verify)
      id: process.env.NEXT_PUBLIC_AFFILIATE_TICKETMASTER ?? "",
      param: "camefrom",
    },
    eventbrite: {
      // Eventbrite affiliate docs: append ?aff=<id> (placeholder — verify)
      id: process.env.NEXT_PUBLIC_AFFILIATE_EVENTBRITE ?? "",
      param: "aff",
    },
    dice: {
      // Dice.fm affiliate docs: append ?dice_id=<id> (placeholder — verify)
      id: process.env.NEXT_PUBLIC_AFFILIATE_DICE ?? "",
      param: "dice_id",
    },
    seetickets: {
      // See Tickets affiliate docs: append ?aff=<id> (placeholder — verify)
      id: process.env.NEXT_PUBLIC_AFFILIATE_SEETICKETS ?? "",
      param: "aff",
    },
  };
}

/**
 * Return the affiliate-tagged version of rawUrl for the given provider.
 *
 * - If the provider is known and the env var is set, appends the correct
 *   query param to rawUrl.
 * - If the provider is unknown or the env var is empty, returns rawUrl
 *   unchanged.
 * - If URL parsing fails, returns rawUrl unchanged.
 *
 * @param provider  Ticket provider string as stored in the DB (any case).
 * @param rawUrl    The original ticket URL.
 */
export function affiliateUrl(provider: string, rawUrl: string): string {
  const config = buildConfig();
  const key = normaliseProvider(provider);
  const entry = config[key];

  if (!entry || !entry.id) {
    // Unknown provider or no affiliate ID configured — pass through unchanged.
    return rawUrl;
  }

  return appendParam(rawUrl, entry.param, entry.id);
}

/**
 * Returns true when an affiliate ID is configured for the given provider.
 * Useful for conditionally rendering "Partner" badges or similar UI.
 */
export function isAffiliateConfigured(provider: string): boolean {
  const config = buildConfig();
  const key = normaliseProvider(provider);
  const entry = config[key];
  return !!entry?.id;
}
