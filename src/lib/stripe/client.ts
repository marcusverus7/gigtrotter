import "server-only";

import Stripe from "stripe";

import { serverEnv } from "@/lib/env";

/**
 * One Stripe client, or null when STRIPE_SECRET_KEY is not set — every
 * ticketing surface then shows "payments not switched on" rather than
 * throwing. Test keys (sk_test_…) exercise the whole flow with Stripe's test
 * cards and a test Connect account; swap to live keys in Vercel when the
 * first real event goes on sale.
 */
let cached: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = serverEnv.stripeSecretKey;
  cached = key ? new Stripe(key, { typescript: true }) : null;
  return cached;
}

export const stripeConfigured = () => !!serverEnv.stripeSecretKey;
export const stripeLive = () => (serverEnv.stripeSecretKey ?? "").startsWith("sk_live_");
