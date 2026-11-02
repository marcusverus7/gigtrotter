import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env";

/**
 * Signed capability for the year-in-review share card.
 *
 * `/api/review/[year]` renders a PNG through the service client so the link
 * works for people without the app — but a year's worth of someone's gigs,
 * cities and travel is exactly what the privacy model guards. The owner's
 * page mints a token; the route serves nothing without it. Same shape as the
 * countdown token, derived from the existing master key: no new secret, no
 * schema change.
 */
function sign(userId: string, year: number): string {
  return createHmac("sha256", serverEnv.captureMasterKey)
    .update(`review:${userId}:${year}`)
    .digest("hex")
    .slice(0, 32);
}

export function reviewToken(userId: string, year: number): string {
  return sign(userId, year);
}

export function verifyReviewToken(
  userId: string,
  year: number,
  token: string | null | undefined,
): boolean {
  if (!token) return false;
  const expected = Buffer.from(sign(userId, year));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
