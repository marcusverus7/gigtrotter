import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { dispatchStripeEvent } from "@/lib/stripe/events";
import { createServiceClient } from "@/lib/supabase/server";
import { expireOrder, fulfilOrder } from "@/lib/tickets/fulfil";

export const runtime = "nodejs";

/**
 * Stripe → GigTrotter. The signature check is the whole security model of
 * this route: anyone can POST here, only Stripe can produce a body that
 * verifies against STRIPE_WEBHOOK_SECRET. The raw body must be read as text
 * BEFORE any JSON parsing or the signature will not match.
 *
 * Every verified event is written to the stripe_events inbox BEFORE it is
 * acted on (PAY-03), so a crash between "received" and "done" is replayable
 * by the reconciler, and a duplicate delivery of an already-processed event
 * is answered 200 without doing anything. A handler failure answers 500 so
 * Stripe retries; the inbox row keeps the error either way.
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

  const service = createServiceClient();
  const orderId =
    ((event.data.object as { metadata?: Record<string, string> | null }).metadata?.order_id as string | undefined) ?? null;

  // Inbox first. 23505 = we have seen this event id before.
  let inbox = true;
  const { error: insErr } = await service.from("stripe_events").insert({
    id: event.id,
    type: event.type,
    order_id: orderId,
    payload: event as unknown as Record<string, unknown>,
  } as never);
  if (insErr?.code === "23505") {
    const { data: seen } = await service
      .from("stripe_events")
      .select("processed_at")
      .eq("id", event.id)
      .maybeSingle();
    if (seen?.processed_at) return NextResponse.json({ received: true, duplicate: true });
  } else if (insErr) {
    // 42P01: migration 0031 not applied yet — process without the inbox
    // rather than refusing payments.
    inbox = false;
    console.error("[stripe] inbox unavailable", insErr.code, insErr.message);
  }

  try {
    const r = await dispatchStripeEvent(event, { fulfil: fulfilOrder, expire: expireOrder });
    if (inbox)
      await service
        .from("stripe_events")
        .update({ processed_at: new Date().toISOString(), last_error: null } as never)
        .eq("id", event.id);
    if (r.action !== "ignored") console.log("[stripe]", r.action, r.orderId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe] handler failed", event.type, msg);
    if (inbox) {
      const { data: row } = await service.from("stripe_events").select("attempts").eq("id", event.id).maybeSingle();
      await service
        .from("stripe_events")
        .update({ attempts: (row?.attempts ?? 0) + 1, last_error: msg.slice(0, 500) } as never)
        .eq("id", event.id);
    }
    // 500 makes Stripe retry, which is what we want for a transient failure.
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
