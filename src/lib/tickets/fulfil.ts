import "server-only";

import { serverEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
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
 *
 * An order carrying `listing_id` is a face-value resale: no new stock is
 * committed; the seller's ticket is voided and re-issued to the buyer, and the
 * seller is refunded the face value (see fulfilResale).
 */

/** What fulfilment reaches for, so a test can hand in fakes. */
export type FulfilDeps = {
  service?: ReturnType<typeof createServiceClient>;
  secret?: string;
  /** Refund a payment for part of its amount, pulling the same amount back from the promoter. */
  refund?: (r: { paymentIntentId: string; amountCents: number }) => Promise<void>;
};

type StripeInfo = { sessionId: string; paymentIntentId: string | null; email: string | null };

type EventRow = {
  id: string;
  title: string;
  headliner: string | null;
  venue_id: string | null;
  venue_name: string | null;
  venue_city: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

const EVENT_SELECT = "id, title, headliner, venue_id, venue_name, venue_city, starts_at, ends_at";

async function defaultRefund(r: { paymentIntentId: string; amountCents: number }) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  await stripe.refunds.create({
    payment_intent: r.paymentIntentId,
    amount: r.amountCents,
    reverse_transfer: true,
    refund_application_fee: false,
  });
}

export async function fulfilOrder(
  orderId: string,
  stripe: StripeInfo,
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
    .select("id, user_id, event_id, listing_id")
    .maybeSingle();
  if (!claimed) return { issued: 0, already: true };

  if (claimed.listing_id) {
    return fulfilResale(service, secret, deps.refund ?? defaultRefund, claimed.listing_id, {
      id: claimed.id,
      userId: claimed.user_id,
      paymentIntentId: stripe.paymentIntentId,
    });
  }

  const [{ data: items }, { data: event }] = await Promise.all([
    service
      .from("order_items")
      .select("tier_id, quantity, unit_price_cents")
      .eq("order_id", orderId),
    service.from("events").select(EVENT_SELECT).eq("id", claimed.event_id).maybeSingle(),
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
      const ok = await issueTicket(service, secret, {
        event: event as EventRow,
        tierId: it.tier_id,
        tierName: tier?.name ?? null,
        ownerId: claimed.user_id,
        orderId,
        issuedAs: "purchase",
        transferredFrom: null,
      });
      if (ok) issued += 1;
    }
    await service.rpc("commit_tier", { target_tier: it.tier_id, qty: it.quantity });
  }

  await markGoing(service, event.id, claimed.user_id);
  return { issued, already: false };
}

/** One admission: a signed code, a wallet item for the holder, a tickets row linking them. */
async function issueTicket(
  service: ReturnType<typeof createServiceClient>,
  secret: string,
  t: {
    event: EventRow;
    tierId: string;
    tierName: string | null;
    ownerId: string;
    orderId: string | null;
    issuedAs: "purchase" | "resale";
    transferredFrom: string | null;
  },
): Promise<boolean> {
  const code = makeTicketCode(secret);
  const { event } = t;
  const { data: wallet } = await service
    .from("wallet_items")
    .insert({
      user_id: t.ownerId,
      kind: "ticket",
      status: deriveStatus(event.starts_at, event.ends_at),
      title: event.title,
      subtitle:
        [t.tierName, event.venue_name, event.venue_city].filter(Boolean).join(" · ") || null,
      venue_id: event.venue_id,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      purchased_via_platform: true,
      meta: {
        audience: "inner",
        vendor: "gigtrotter",
        gigtrotter_ticket_code: code,
        tier: t.tierName,
        order_id: t.orderId,
        event_id: event.id,
        ...(t.transferredFrom ? { transferred_from: t.transferredFrom } : {}),
      },
    } as never)
    .select("id")
    .single();
  const { error } = await service.from("tickets").insert({
    order_id: t.orderId,
    event_id: event.id,
    tier_id: t.tierId,
    owner_id: t.ownerId,
    wallet_item_id: wallet?.id ?? null,
    code,
    issued_as: t.issuedAs,
    transferred_from: t.transferredFrom,
  } as never);
  return !error;
}

/** Everyone who bought is "going" — feeds the friends-going rail. */
async function markGoing(
  service: ReturnType<typeof createServiceClient>,
  eventId: string,
  userId: string,
) {
  await service
    .from("event_interests")
    .upsert({ event_id: eventId, user_id: userId, interest_type: "going" } as never, {
      onConflict: "event_id,user_id",
      ignoreDuplicates: true,
    });
}

/**
 * A paid resale order: void the seller's ticket, issue a fresh one to the
 * buyer under this order, mark the listing sold, refund the seller the face
 * value (reversing that much of the promoter's transfer). If the seller's
 * ticket is no longer valid by the time payment lands — scanned at the door,
 * transferred elsewhere — the buyer is refunded in full instead.
 */
async function fulfilResale(
  service: ReturnType<typeof createServiceClient>,
  secret: string,
  refund: NonNullable<FulfilDeps["refund"]>,
  listingId: string,
  order: { id: string; userId: string; paymentIntentId: string | null },
): Promise<{ issued: number; already: boolean }> {
  const { data: listing } = await service
    .from("ticket_listings")
    .select("id, ticket_id, seller_id, event_id, tier_id, price_cents")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return { issued: 0, already: false };

  const { data: old } = await service
    .from("tickets")
    .update({ status: "transferred" } as never)
    .eq("id", listing.ticket_id)
    .eq("status", "valid")
    .select("id, order_id, wallet_item_id")
    .maybeSingle();

  if (!old) {
    const { data: o } = await service
      .from("orders")
      .select("total_cents")
      .eq("id", order.id)
      .maybeSingle();
    if (order.paymentIntentId && o) {
      try {
        await refund({ paymentIntentId: order.paymentIntentId, amountCents: o.total_cents });
      } catch (err) {
        console.error(
          "[resale] buyer refund failed",
          order.id,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    await service
      .from("orders")
      .update({ status: "refunded" } as never)
      .eq("id", order.id);
    await service
      .from("ticket_listings")
      .update({ status: "withdrawn" } as never)
      .eq("id", listing.id);
    console.error(
      "[resale] seller ticket no longer valid; buyer refunded",
      JSON.stringify({ order: order.id, listing: listing.id }),
    );
    return { issued: 0, already: false };
  }

  if (old.wallet_item_id) {
    await service
      .from("wallet_items")
      .update({ status: "archived" } as never)
      .eq("id", old.wallet_item_id);
  }

  const [{ data: event }, { data: tier }] = await Promise.all([
    service.from("events").select(EVENT_SELECT).eq("id", listing.event_id).maybeSingle(),
    service.from("ticket_tiers").select("name").eq("id", listing.tier_id).maybeSingle(),
  ]);
  if (!event) return { issued: 0, already: false };

  const ok = await issueTicket(service, secret, {
    event: event as EventRow,
    tierId: listing.tier_id,
    tierName: tier?.name ?? null,
    ownerId: order.userId,
    orderId: order.id,
    issuedAs: "resale",
    transferredFrom: listing.seller_id,
  });

  await service
    .from("ticket_listings")
    .update({
      status: "sold",
      buyer_order_id: order.id,
      sold_at: new Date().toISOString(),
    } as never)
    .eq("id", listing.id);

  // The seller gets face value back on the card they paid with; the promoter
  // keeps exactly one face value per seat because this buyer just paid it.
  if (old.order_id) {
    const { data: sellerOrder } = await service
      .from("orders")
      .select("stripe_payment_intent_id")
      .eq("id", old.order_id)
      .maybeSingle();
    if (sellerOrder?.stripe_payment_intent_id) {
      try {
        await refund({
          paymentIntentId: sellerOrder.stripe_payment_intent_id,
          amountCents: listing.price_cents,
        });
      } catch (err) {
        console.error(
          "[resale] seller refund failed",
          JSON.stringify({ listing: listing.id, order: order.id }),
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  await markGoing(service, event.id, order.userId);
  return { issued: ok ? 1 : 0, already: false };
}

/** Checkout expired or was cancelled: give the stock (or the listing) back. */
export async function expireOrder(orderId: string, deps: FulfilDeps = {}): Promise<void> {
  const service = deps.service ?? createServiceClient();
  const { data: o } = await service
    .from("orders")
    .update({ status: "expired" } as never)
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id, listing_id")
    .maybeSingle();
  if (!o) return;
  if (o.listing_id) {
    await service
      .from("ticket_listings")
      .update({ status: "open", reserved_until: null } as never)
      .eq("id", o.listing_id)
      .eq("status", "reserved");
    return;
  }
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
