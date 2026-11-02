import "server-only";

import { serverEnv } from "@/lib/env";
import { makeTicketCode } from "@/lib/tickets/codes";
import { createServiceClient } from "@/lib/supabase/server";
import { deriveStatus } from "@/lib/wallet/lifecycle";

/**
 * Turn a paid order into tickets and wallet items. Idempotent: a second call
 * for an order already marked paid does nothing, so a webhook retry or a
 * success-page refresh cannot double-issue.
 *
 * Each ticket is one admission with its own signed code, and lands in the
 * buyer's wallet as a ticket item flagged purchased_via_platform — which is
 * what unlocks the event's discussion, and what night mode reads to show a
 * real QR rather than issuer advice.
 */
/** The handful of service-client calls fulfilment makes, so a test can hand in a fake. */
export type FulfilDeps = { service?: ReturnType<typeof createServiceClient>; secret?: string };

export async function fulfilOrder(
  orderId: string,
  stripe: { sessionId: string; paymentIntentId: string | null; email: string | null },
  deps: FulfilDeps = {},
): Promise<{ issued: number; already: boolean }> {
  const service = deps.service ?? createServiceClient();
  const secret = deps.secret ?? serverEnv.captureMasterKey;

  const { data: claimed } = await service
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: stripe.paymentIntentId,
      buyer_email: stripe.email,
    } as never)
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id, user_id, event_id")
    .maybeSingle();
  if (!claimed) return { issued: 0, already: true };

  const [{ data: items }, { data: event }] = await Promise.all([
    service
      .from("order_items")
      .select("tier_id, quantity, unit_price_cents")
      .eq("order_id", orderId),
    service
      .from("events")
      .select("id, title, headliner, venue_id, venue_name, venue_city, starts_at, ends_at")
      .eq("id", claimed.event_id)
      .maybeSingle(),
  ]);
  if (!event) return { issued: 0, already: false };

  let issued = 0;
  for (const it of items ?? []) {
    const { data: tier } = await service
      .from("ticket_tiers")
      .select("name")
      .eq("id", it.tier_id)
      .maybeSingle();
    for (let i = 0; i < it.quantity; i++) {
      const code = makeTicketCode(secret);
      const { data: wallet } = await service
        .from("wallet_items")
        .insert({
          user_id: claimed.user_id,
          kind: "ticket",
          status: deriveStatus(event.starts_at, event.ends_at),
          title: event.title,
          subtitle:
            [tier?.name, event.venue_name, event.venue_city].filter(Boolean).join(" · ") || null,
          venue_id: event.venue_id,
          starts_at: event.starts_at,
          ends_at: event.ends_at,
          purchased_via_platform: true,
          meta: {
            audience: "inner",
            vendor: "gigtrotter",
            gigtrotter_ticket_code: code,
            tier: tier?.name ?? null,
            order_id: orderId,
            event_id: event.id,
          },
        } as never)
        .select("id")
        .single();
      const { error } = await service.from("tickets").insert({
        order_id: orderId,
        event_id: event.id,
        tier_id: it.tier_id,
        owner_id: claimed.user_id,
        wallet_item_id: wallet?.id ?? null,
        code,
        issued_as: "purchase",
      } as never);
      if (!error) issued += 1;
    }
    await service.rpc("commit_tier", { target_tier: it.tier_id, qty: it.quantity });
  }

  // Everyone who bought is "going" — feeds the friends-going rail.
  await service
    .from("event_interests")
    .upsert({ event_id: event.id, user_id: claimed.user_id, interest_type: "going" } as never, {
      onConflict: "event_id,user_id",
      ignoreDuplicates: true,
    });

  return { issued, already: false };
}

/** Checkout expired or was cancelled: give the stock back. */
export async function expireOrder(orderId: string, deps: FulfilDeps = {}): Promise<void> {
  const service = deps.service ?? createServiceClient();
  const { data: o } = await service
    .from("orders")
    .update({ status: "expired" } as never)
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!o) return;
  const { data: items } = await service
    .from("order_items")
    .select("tier_id, quantity")
    .eq("order_id", orderId);
  for (const it of items ?? [])
    await service.rpc("release_tier", { target_tier: it.tier_id, qty: it.quantity });
}

/**
 * Belt and braces for the webhook: any order still pending well past its own
 * expiry (Stripe sends checkout.session.expired at the same moment, but a
 * webhook can be down or unregistered) gives its stock back. Run hourly.
 */
export async function expireStaleOrders(
  deps: FulfilDeps = {},
  now: Date = new Date(),
): Promise<number> {
  const service = deps.service ?? createServiceClient();
  const cutoff = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const { data: stale } = await service
    .from("orders")
    .select("id")
    .eq("status", "pending")
    .lt("expires_at", cutoff)
    .limit(500);
  for (const o of stale ?? []) await expireOrder(o.id, { service });
  return stale?.length ?? 0;
}
