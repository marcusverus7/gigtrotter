import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env";

/**
 * Signed capability for the public countdown card.
 *
 * `/api/countdown/[id]` renders a PNG from a wallet item and has to stay
 * reachable without a session — the whole point is that you send the link to
 * people who do not have the app. But it reads through the service client, so
 * for a while it would render *any* wallet item to *anyone* who had an id, and
 * the id in question is the same one that sits in the owner's own
 * `/app/item/<id>` URL. That turned an address bar into a disclosure of a
 * future plan, which is exactly what the time-shift rule in the database
 * exists to prevent.
 *
 * The link is now a capability rather than a lookup: the owner's page mints a
 * token, and the route serves nothing without it. Deriving the token from the
 * existing master key keeps this to zero schema change and zero new secrets.
 */
function sign(id: string): string {
  return createHmac("sha256", serverEnv.captureMasterKey)
    .update(`countdown:${id}`)
    .digest("hex")
    .slice(0, 32);
}

export function countdownToken(id: string): string {
  return sign(id);
}

export function verifyCountdownToken(
  id: string,
  token: string | null | undefined,
): boolean {
  if (!token) return false;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(token);
  // timingSafeEqual throws on a length mismatch, so check that first.
  return expected.length === given.length && timingSafeEqual(expected, given);
}
