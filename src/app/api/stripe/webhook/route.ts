import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { dispatchStripeEvent } from "@/lib/stripe/events";
import { expireOrder, fulfilOrder } from "@/lib/tickets/fulfil";

export const runtime = "nodejs";

/**
 * Stripe → GigTrotter. The signature check is the whole security model of
 * this route: anyone can POST here, only Stripe can produce a body that
 * verifies against STRIPE_WEBHOOK_SECRET. The raw body must be read as text
 * BEFORE any JSON parsing or the signature will not match.
 *
 * Register in the Stripe dashboard (or `stripe listen --forward-to
 * localhost:3002/api/stripe/webhook` in development) for:
 *   checkout.session.completed, checkout.session.expired
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const secret = serverEnv.stripeWebhookSecret;
  if (!stripe || !secret)
    return NextResponse.json({ error: "payments not configured" }, { status: 503 });

  const sig = request.headers.get("stripe-signature");
  const raw = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig ?? "", secret);
  } catch (err) {
    console.error("[stripe] bad signature", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  try {
    const r = await dispatchStripeEvent(event, { fulfil: fulfilOrder, expire: expireOrder });
    if (r.action !== "ignored") console.log("[stripe]", r.action, r.orderId);
  } catch (err) {
    // 500 makes Stripe retry, which is what we want for a transient failure.
    console.error(
      "[stripe] handler failed",
      event.type,
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
