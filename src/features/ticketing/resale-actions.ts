"use server";

import { revalidatePath } from "next/cache";

import { publicEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { expireOrder } from "@/lib/tickets/fulfil";
import { buyerFeeCents, formatMoney, type FeeSchedule } from "@/lib/tickets/pricing";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Face-value resale (migration 0030). The seller lists; the buyer pays
 * through the same Stripe checkout as a primary sale; fulfilment (fulfil.ts)
 * swaps the ticket and refunds the seller. Nothing here sets a price: it is
 * always the tier's face value.
 */

const LISTING_HOLD_MS = 30 * 60 * 1000;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first.");
  return user;
}

export async function listTicketForResale(ticketId: string): Promise<{ listingId: string }> {
  const user = await requireUser();
  const service = createServiceClient();

  const { data: ticket } = await service
    .from("tickets")
    .select("id, status, event_id, tier_id, order_id, issued_as")
    .eq("id", ticketId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!ticket) throw new Error("Ticket not found.");
  if (ticket.status !== "valid") throw new Error("This ticket can no longer be resold.");
  if (ticket.issued_as !== "purchase" || !ticket.order_id) {
    throw new Error(
      "Only tickets bought here can be resold. Pass a gift or comp on with Send this ticket.",
    );
  }

  const [{ data: event }, { data: tier }, { data: order }] = await Promise.all([
    service
      .from("events")
      .select("id, title, starts_at, promoter_id")
      .eq("id", ticket.event_id)
      .maybeSingle(),
    service
      .from("ticket_tiers")
      .select("name, price_cents, currency")
      .eq("id", ticket.tier_id)
      .maybeSingle(),
    service
      .from("orders")
      .select("stripe_payment_intent_id")
      .eq("id", ticket.order_id)
      .maybeSingle(),
  ]);
  if (!event || !tier) throw new Error("Event not found.");
  if (event.starts_at && new Date(event.starts_at).getTime() < Date.now())
    throw new Error("The event has started.");
  if (tier.price_cents <= 0)
    throw new Error("A free ticket cannot be resold. Send it to a friend instead.");
  if (!order?.stripe_payment_intent_id)
    throw new Error("Your payment is still settling. Try again in a minute.");

  const { data: listing, error } = await service
    .from("ticket_listings")
    .insert({
      ticket_id: ticket.id,
      seller_id: user.id,
      event_id: ticket.event_id,
      tier_id: ticket.tier_id,
      price_cents: tier.price_cents,
      currency: tier.currency,
      status: "open",
    } as never)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("This ticket is already listed.");
    if (error.code === "42P01") throw new Error("Resale is not switched on yet (migration 0030).");
    throw new Error(error.message);
  }
  if (!listing) throw new Error("Could not list the ticket.");

  await notifyWaitlist(service, {
    eventId: ticket.event_id,
    listingId: listing.id,
    title: event.title,
    tier: tier.name,
    priceCents: tier.price_cents,
    currency: tier.currency,
    sellerId: user.id,
  });

  revalidatePath(`/app/events/${ticket.event_id}`);
  revalidatePath("/app");
  return { listingId: listing.id };
}

async function notifyWaitlist(
  service: ReturnType<typeof createServiceClient>,
  l: {
    eventId: string;
    listingId: string;
    title: string;
    tier: string;
    priceCents: number;
    currency: string;
    sellerId: string;
  },
) {
  try {
    const { data: rows } = await service
      .from("event_waitlist")
      .select("user_id")
      .eq("event_id", l.eventId)
      .limit(500);
    const users = (rows ?? []).map((r) => r.user_id).filter((u) => u !== l.sellerId);
    if (users.length === 0) return;
    await service.from("alerts").upsert(
      users.map((user_id) => ({
        user_id,
        kind: "resale",
        title: `A face-value ticket for ${l.title} just went up`,
        body: `${l.tier} · ${formatMoney(l.priceCents, l.currency)} plus the booking fee. First come, first served.`,
        url: `/app/events/${l.eventId}`,
        dedupe_key: `resale:${l.listingId}`,
      })) as never,
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    );
  } catch (err) {
    console.error(
      "[resale] waitlist alert failed",
      err instanceof Error ? err.message : String(err),
    );
  }
}

export async function withdrawListing(listingId: string): Promise<void> {
  const user = await requireUser();
  const service = createServiceClient();
  const { data } = await service
    .from("ticket_listings")
    .update({ status: "withdrawn" } as never)
    .eq("id", listingId)
    .eq("seller_id", user.id)
    .eq("status", "open")
    .select("id, event_id");
  if (!data || data.length === 0)
    throw new Error("Could not withdraw — someone may be buying it right now.");
  revalidatePath(`/app/events/${data[0].event_id}`);
  revalidatePath("/app");
}

export async function createResaleCheckout(listingId: string): Promise<{ url: string }> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Payments are not switched on yet.");
  const user = await requireUser();
  const service = createServiceClient();

  const { data: listing } = await service
    .from("ticket_listings")
    .select("id, ticket_id, seller_id, event_id, tier_id, price_cents, currency, status")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing || listing.status !== "open") throw new Error("That ticket has just gone.");
  if (listing.seller_id === user.id) throw new Error("That is your own listing.");

  const [{ data: event }, { data: tier }] = await Promise.all([
    service
      .from("events")
      .select("id, title, starts_at, promoter_id")
      .eq("id", listing.event_id)
      .maybeSingle(),
    service.from("ticket_tiers").select("name").eq("id", listing.tier_id).maybeSingle(),
  ]);
  if (!event?.promoter_id) throw new Error("Event not found.");
  if (event.starts_at && new Date(event.starts_at).getTime() < Date.now())
    throw new Error("This event has already started.");

  const { data: promoter } = await service
    .from("promoter_accounts")
    .select("stripe_account_id, charges_enabled, fee_bps, fee_fixed_cents")
    .eq("user_id", event.promoter_id)
    .maybeSingle();
  if (!promoter?.stripe_account_id || !promoter.charges_enabled) {
    throw new Error("The promoter has not finished setting up payouts yet.");
  }
  const fees: FeeSchedule = { bps: promoter.fee_bps, fixedCents: promoter.fee_fixed_cents };
  const face = listing.price_cents;
  const fee = buyerFeeCents(face, fees);
  const currency = listing.currency.toLowerCase();
  const expiresAt = new Date(Date.now() + LISTING_HOLD_MS);

  // Claim the listing atomically; the .select() guard is the lock.
  const { data: held } = await service
    .from("ticket_listings")
    .update({ status: "reserved", reserved_until: expiresAt.toISOString() } as never)
    .eq("id", listing.id)
    .eq("status", "open")
    .select("id");
  if (!held || held.length === 0) throw new Error("Someone else got there first.");

  const reopen = () =>
    service
      .from("ticket_listings")
      .update({ status: "open", reserved_until: null } as never)
      .eq("id", listing.id)
      .eq("status", "reserved");

  const { data: order } = await service
    .from("orders")
    .insert({
      user_id: user.id,
      event_id: listing.event_id,
      status: "pending",
      currency: listing.currency.toUpperCase(),
      face_cents: face,
      fee_cents: fee,
      total_cents: face + fee,
      expires_at: expiresAt.toISOString(),
      listing_id: listing.id,
    } as never)
    .select("id")
    .single();
  if (!order) {
    await reopen();
    throw new Error("Could not start the order.");
  }

  const site = publicEnv.siteUrl;
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: face + fee,
            product_data: {
              name: `${event.title} — ${tier?.name ?? "Ticket"} (fan resale, face value)`,
              description:
                fee > 0 ? `Includes ${formatMoney(fee, listing.currency)} booking fee` : undefined,
            },
          },
        },
      ],
      customer_email: user.email ?? undefined,
      success_url: `${site}/app/orders/${order.id}?paid=1`,
      cancel_url: `${site}/app/events/${listing.event_id}?cancelled=1`,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      metadata: {
        order_id: order.id,
        event_id: listing.event_id,
        user_id: user.id,
        listing_id: listing.id,
      },
      payment_intent_data: {
        transfer_data: { destination: promoter.stripe_account_id, amount: face },
        metadata: { order_id: order.id, listing_id: listing.id },
        description: `${event.title} resale ticket`,
      },
      allow_promotion_codes: false,
    });
  } catch (err) {
    await expireOrder(order.id); // puts the listing back to open
    console.error(
      "[resale] checkout session failed",
      err instanceof Error ? err.message : String(err),
    );
    throw new Error("Could not open the payment page. Please try again.");
  }
  await service
    .from("orders")
    .update({ stripe_checkout_session_id: session.id } as never)
    .eq("id", order.id);
  if (!session.url) throw new Error("Stripe did not return a checkout page.");
  return { url: session.url };
}
