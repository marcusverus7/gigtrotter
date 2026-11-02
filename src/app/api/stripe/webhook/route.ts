import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
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
  if (!stripe || !secret) return NextResponse.json({ error: "payments not configured" }, { status: 503 });

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
    if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      const orderId = s.metadata?.order_id;
      if (orderId && s.payment_status === "paid") {
        const r = await fulfilOrder(orderId, {
          sessionId: s.id,
          paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
          email: s.customer_details?.email ?? null,
        });
        console.log("[stripe] fulfilled", JSON.stringify({ orderId, ...r }));
      }
    } else if (event.type === "checkout.session.expired") {
      const orderId = event.data.object.metadata?.order_id;
      if (orderId) await expireOrder(orderId);
    }
  } catch (err) {
    // 500 makes Stripe retry, which is what we want for a transient failure.
    console.error("[stripe] handler failed", event.type, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
