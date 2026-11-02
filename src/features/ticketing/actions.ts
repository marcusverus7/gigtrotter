"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { publicEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { makeTicketCode, normaliseCode } from "@/lib/tickets/codes";
import { currentSigningSecret, verifyTicketCodeAny } from "@/lib/tickets/keys";
import { expireOrder } from "@/lib/tickets/fulfil";
import { orderTotals, validateBasket, type FeeSchedule } from "@/lib/tickets/pricing";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { deriveStatus } from "@/lib/wallet/lifecycle";

/* ── promoter: tiers ─────────────────────────────────────────────────────── */

const TierInput = z.object({
  id: z.string().uuid().optional(),
  eventId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional().nullable(),
  priceCents: z.number().int().min(0).max(100_000_00),
  quantity: z.number().int().min(0).max(100_000),
  maxPerOrder: z.number().int().min(1).max(20).default(6),
  status: z.enum(["draft", "on_sale", "paused", "ended"]).default("on_sale"),
  salesStart: z.string().datetime().nullable().optional(),
  salesEnd: z.string().datetime().nullable().optional(),
});

export async function saveTier(input: z.infer<typeof TierInput>) {
  const t = TierInput.parse(input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // The RLS policy on ticket_tiers checks events.promoter_id, so a tier for
  // someone else's event is refused — the .select() guard makes that visible.
  const row = {
    event_id: t.eventId,
    name: t.name,
    description: t.description ?? null,
    price_cents: t.priceCents,
    quantity: t.quantity,
    max_per_order: t.maxPerOrder,
    status: t.status,
    sales_start: t.salesStart ?? null,
    sales_end: t.salesEnd ?? null,
  };
  const q = t.id
    ? supabase
        .from("ticket_tiers")
        .update(row as never)
        .eq("id", t.id)
        .select("id")
    : supabase
        .from("ticket_tiers")
        .insert(row as never)
        .select("id");
  const { data, error } = await q;
  if (error)
    throw new Error(
      error.code === "42P01" ? "Ticketing is not switched on yet (migration 0029)." : error.message,
    );
  if (!data || data.length === 0) throw new Error("Not saved — is this your event?");
  revalidatePath(`/app/events/${t.eventId}`);
  revalidatePath(`/app/events/${t.eventId}/tickets`);
}

export async function deleteTier(tierId: string, eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: tier } = await supabase
    .from("ticket_tiers")
    .select("sold")
    .eq("id", tierId)
    .maybeSingle();
  if (tier && tier.sold > 0)
    throw new Error("Tickets have been sold on this tier — pause it instead of deleting it.");
  const { data, error } = await supabase
    .from("ticket_tiers")
    .delete()
    .eq("id", tierId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Not deleted — is this your event?");
  revalidatePath(`/app/events/${eventId}/tickets`);
}

/* ── buyer: checkout ─────────────────────────────────────────────────────── */

const Basket = z
  .array(z.object({ tierId: z.string().uuid(), quantity: z.number().int().min(0).max(20) }))
  .min(1);

export async function createCheckout(
  eventId: string,
  basketInput: unknown,
): Promise<{ url: string }> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Payments are not switched on yet.");
  const basket = Basket.parse(basketInput).filter((b) => b.quantity > 0);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to buy tickets.");

  const [{ data: event }, { data: tiers }, { data: avail }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, starts_at, promoter_id, currency")
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("ticket_tiers")
      .select("id, name, price_cents, max_per_order, status, currency")
      .eq("event_id", eventId),
    supabase.rpc("tier_availability", { target_event: eventId }),
  ]);
  if (!event) throw new Error("Event not found.");
  if (!event.promoter_id) throw new Error("This event is not sold through GigTrotter.");
  if (event.starts_at && new Date(event.starts_at).getTime() < Date.now())
    throw new Error("This event has already started.");

  const remaining = new Map<string, number>(
    ((avail ?? []) as Array<{ tier_id: string; remaining: number }>).map((a) => [
      a.tier_id,
      Number(a.remaining),
    ]),
  );
  const check = validateBasket(
    basket,
    (tiers ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      priceCents: t.price_cents,
      maxPerOrder: t.max_per_order,
      status: t.status,
      remaining: remaining.get(t.id) ?? 0,
    })),
  );
  if (!check.ok) throw new Error(check.reason);

  const service = createServiceClient();
  const { data: promoter } = await service
    .from("promoter_accounts")
    .select("stripe_account_id, charges_enabled, fee_bps, fee_fixed_cents")
    .eq("user_id", event.promoter_id)
    .maybeSingle();
  if (!promoter?.stripe_account_id || !promoter.charges_enabled) {
    throw new Error("The promoter has not finished setting up payouts yet.");
  }
  const fees: FeeSchedule = { bps: promoter.fee_bps, fixedCents: promoter.fee_fixed_cents };
  const totals = orderTotals(check.lines, fees);
  const currency = (event.currency ?? "GBP").toLowerCase();

  // Reserve stock first, atomically per tier; roll back on any failure.
  const reserved: Array<{ tierId: string; quantity: number }> = [];
  for (const l of check.lines) {
    const { data: ok } = await service.rpc("reserve_tier", {
      target_tier: l.tierId,
      qty: l.quantity,
    });
    if (!ok) {
      for (const r of reserved)
        await service.rpc("release_tier", { target_tier: r.tierId, qty: r.quantity });
      throw new Error(`${l.name} just sold out — pick another ticket type.`);
    }
    reserved.push({ tierId: l.tierId, quantity: l.quantity });
  }

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const { data: order } = await service
    .from("orders")
    .insert({
      user_id: user.id,
      event_id: eventId,
      status: "pending",
      currency: currency.toUpperCase(),
      face_cents: totals.faceCents,
      fee_cents: totals.feeCents,
      total_cents: totals.totalCents,
      expires_at: expiresAt.toISOString(),
    } as never)
    .select("id")
    .single();
  if (!order) {
    for (const r of reserved)
      await service.rpc("release_tier", { target_tier: r.tierId, qty: r.quantity });
    throw new Error("Could not start the order.");
  }
  await service
    .from("order_items")
    .insert(
      check.lines.map((l) => ({
        order_id: order.id,
        tier_id: l.tierId,
        quantity: l.quantity,
        unit_price_cents: l.unitPriceCents,
      })) as never,
    );

  const site = publicEnv.siteUrl;
  const lineItems = totals.lines.map((l) => ({
    quantity: l.quantity,
    price_data: {
      currency,
      unit_amount: l.unitPriceCents + l.lineFeeCents / l.quantity,
      product_data: {
        name: `${event.title} — ${l.name}`,
        description:
          l.lineFeeCents > 0
            ? `Includes ${new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(l.lineFeeCents / l.quantity / 100)} booking fee`
            : undefined,
      },
    },
  }));

  // Destination charge: the buyer's card is charged on the platform, Stripe
  // moves `transfer_data.amount` (face value) to the promoter, the platform
  // keeps the fee and pays Stripe's processing out of it. The promoter sees
  // every penny of face.
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: user.email ?? undefined,
      success_url: `${site}/app/orders/${order.id}?paid=1`,
      cancel_url: `${site}/app/events/${eventId}?cancelled=1`,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      metadata: { order_id: order.id, event_id: eventId, user_id: user.id },
      payment_intent_data: {
        transfer_data: { destination: promoter.stripe_account_id, amount: totals.promoterCents },
        metadata: { order_id: order.id },
        description: `${event.title} tickets`,
      },
      allow_promotion_codes: false,
    });
  } catch (err) {
    // No Stripe session means no checkout.session.expired will ever arrive
    // to free the stock, so free it here and leave the order marked expired.
    await expireOrder(order.id);
    console.error(
      "[stripe] checkout session failed",
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

/* ── promoter: comps, check-in ──────────────────────────────────────────── */

async function requirePromoterOf(eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: event } = await supabase
    .from("events")
    .select("id, title, promoter_id, venue_id, venue_name, venue_city, starts_at, ends_at")
    .eq("id", eventId)
    .maybeSingle();
  if (!event || event.promoter_id !== user.id)
    throw new Error("Only the promoter of this event can do that.");
  return { user, event };
}

export async function issueCompTicket(
  eventId: string,
  tierId: string,
  username: string,
  note = "comp",
) {
  const { user, event } = await requirePromoterOf(eventId);
  const service = createServiceClient();
  const u = username.toLowerCase().trim().replace(/^@/, "");
  const { data: target } = await service
    .from("profiles")
    .select("id")
    .eq("username", u)
    .maybeSingle();
  if (!target) throw new Error("No one with that username.");
  const { data: tier } = await service
    .from("ticket_tiers")
    .select("id, name, event_id")
    .eq("id", tierId)
    .maybeSingle();
  if (!tier || tier.event_id !== eventId) throw new Error("That ticket type is not on this event.");

  const code = makeTicketCode(currentSigningSecret());
  const walletStatus = deriveStatus(event.starts_at, event.ends_at);

  // One transaction for the wallet item and the ticket row (0033). Until the
  // function exists in this database, fall back to the two inserts.
  const tx = await service.rpc("issue_ticket_tx", {
    target_event: eventId,
    target_tier: tierId,
    new_owner: target.id,
    new_code: code,
    issued_as: "comp",
    from_user: user.id,
    for_order: null,
    wallet_status: walletStatus,
    note,
  });
  if (!tx.error) {
    revalidatePath(`/app/events/${eventId}/tickets`);
    return { code };
  }
  if (!isMissingFunction(tx.error)) throw new Error(tx.error.message);

  const { data: wallet } = await service
    .from("wallet_items")
    .insert({
      user_id: target.id,
      kind: "ticket",
      status: walletStatus,
      title: event.title,
      subtitle: [tier.name, event.venue_name, event.venue_city].filter(Boolean).join(" · ") || null,
      venue_id: event.venue_id,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      purchased_via_platform: true,
      meta: {
        audience: "inner",
        vendor: "gigtrotter",
        gigtrotter_ticket_code: code,
        tier: tier.name,
        event_id: event.id,
        comp: note,
      },
    } as never)
    .select("id")
    .single();
  const { error } = await service.from("tickets").insert({
    event_id: eventId,
    tier_id: tierId,
    owner_id: target.id,
    wallet_item_id: wallet?.id ?? null,
    code,
    issued_as: "comp",
    transferred_from: user.id,
  } as never);
  if (error) throw error;
  revalidatePath(`/app/events/${eventId}/tickets`);
  return { code };
}

/** PostgREST's "no such function" (migration not applied yet). */
function isMissingFunction(err: { code?: string; message?: string }): boolean {
  return err.code === "PGRST202" || err.code === "42883" || /could not find the function/i.test(err.message ?? "");
}

export type CheckInResult =
  | { ok: true; title: string; tier: string | null; owner: string | null; usedAt: string }
  | {
      ok: false;
      reason: "invalid" | "unknown" | "used" | "wrong_event" | "void" | "forbidden";
      usedAt?: string | null;
      title?: string;
      /** For "used": true when THIS operator scanned it in the last two minutes, i.e. a retry after a lost response, not a second entry. */
      ownScan?: boolean;
    };

/**
 * Who may check in at this event: the promoter, or a named door operator
 * from event_staff (PAY-04). Decided by the database (can_check_in, 0031)
 * from trusted rows, never from user-editable metadata. Returns null rather
 * than throwing so the scanner can show "forbidden" instead of "uncertain".
 */
export async function checkInRights(eventId: string): Promise<{ userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.rpc("can_check_in", { target_event: eventId });
  if (!error) return data ? { userId: user.id } : null;
  // RPC absent (0031 not applied): promoter only.
  const { data: event } = await supabase.from("events").select("promoter_id").eq("id", eventId).maybeSingle();
  return event?.promoter_id === user.id ? { userId: user.id } : null;
}

export async function checkInTicket(eventId: string, rawCode: string): Promise<CheckInResult> {
  const rights = await checkInRights(eventId);
  if (!rights) return { ok: false, reason: "forbidden" };
  const user = { id: rights.userId };
  const code = normaliseCode(rawCode);
  if (!verifyTicketCodeAny(code).ok) return { ok: false, reason: "invalid" };
  const service = createServiceClient();
  // No `profiles` embed here: tickets.owner_id references auth.users, not
  // profiles, so PostgREST cannot resolve that join and answered with an
  // error that read as "not found" for every valid ticket (caught on the
  // first real door scan, 2026-11-02). The holder's name is a second query.
  const { data: t, error: lookupErr } = await service
    .from("tickets")
    .select("id, event_id, status, used_at, checked_in_by, tier_id, owner_id, events(title), ticket_tiers(name)")
    .eq("code", code)
    .maybeSingle();
  if (lookupErr) throw new Error(`ticket lookup failed: ${lookupErr.message}`);
  if (!t) return { ok: false, reason: "unknown" };
  const row = t as unknown as {
    id: string;
    event_id: string;
    status: string;
    used_at: string | null;
    checked_in_by: string | null;
    owner_id: string;
    events: { title: string } | null;
    ticket_tiers: { name: string } | null;
  };
  if (row.event_id !== eventId)
    return { ok: false, reason: "wrong_event", title: row.events?.title };
  if (row.status === "used") {
    // The same operator re-submitting within two minutes is almost always a
    // retry after a lost response (ENTRY-02): say so, instead of implying a
    // second person is trying the code.
    const ownScan =
      row.checked_in_by === user.id &&
      !!row.used_at &&
      Date.now() - new Date(row.used_at).getTime() < 2 * 60 * 1000;
    return { ok: false, reason: "used", usedAt: row.used_at, title: row.events?.title, ownScan };
  }
  if (row.status !== "valid") return { ok: false, reason: "void", title: row.events?.title };
  const usedAt = new Date().toISOString();
  const { data: done } = await service
    .from("tickets")
    .update({ status: "used", used_at: usedAt, checked_in_by: user.id } as never)
    .eq("id", row.id)
    .eq("status", "valid")
    .select("id");
  if (!done || done.length === 0) return { ok: false, reason: "used", usedAt: row.used_at };
  const { data: holder } = await service
    .from("profiles")
    .select("display_name, username")
    .eq("id", row.owner_id)
    .maybeSingle();
  return {
    ok: true,
    title: row.events?.title ?? "",
    tier: row.ticket_tiers?.name ?? null,
    owner: holder?.display_name ?? (holder?.username ? `@${holder.username}` : null),
    usedAt,
  };
}

/* ── holder: transfer ────────────────────────────────────────────────────── */

export async function transferTicket(ticketId: string, username: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const service = createServiceClient();
  const u = username.toLowerCase().trim().replace(/^@/, "");
  const { data: target } = await service
    .from("profiles")
    .select("id")
    .eq("username", u)
    .maybeSingle();
  if (!target) throw new Error("No one with that username.");
  if (target.id === user.id) throw new Error("That is you.");

  const { data: t } = await service
    .from("tickets")
    .select(
      "id, status, event_id, tier_id, wallet_item_id, events(title, starts_at, ends_at, venue_id, venue_name, venue_city), ticket_tiers(name)",
    )
    .eq("id", ticketId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!t) throw new Error("Ticket not found.");
  const row = t as unknown as {
    id: string;
    status: string;
    event_id: string;
    tier_id: string;
    wallet_item_id: string | null;
    events: {
      title: string;
      starts_at: string | null;
      ends_at: string | null;
      venue_id: string | null;
      venue_name: string | null;
      venue_city: string | null;
    } | null;
    ticket_tiers: { name: string } | null;
  };
  if (row.status !== "valid") throw new Error("This ticket can no longer be transferred.");
  if (row.events?.starts_at && new Date(row.events.starts_at).getTime() < Date.now())
    throw new Error("The event has started.");
  const { data: live } = await service
    .from("ticket_listings")
    .select("id")
    .eq("ticket_id", row.id)
    .in("status", ["open", "reserved"])
    .maybeSingle();
  if (live) throw new Error("This ticket is listed for resale. Withdraw the listing first.");

  // Void + re-issue in ONE transaction (0033): a failure half-way can no
  // longer leave the holder with nothing valid, and the row lock means two
  // concurrent transfers cannot both succeed. Falls back to the stepwise path
  // only while the function is absent from this database.
  const freshCode = makeTicketCode(currentSigningSecret());
  const tx = await service.rpc("transfer_ticket_tx", {
    target_ticket: row.id,
    current_owner: user.id,
    new_owner: target.id,
    new_code: freshCode,
    wallet_status: deriveStatus(row.events?.starts_at ?? null, row.events?.ends_at ?? null),
  });
  if (!tx.error) {
    const r = (tx.data ?? {}) as { error?: string };
    if (r.error === "listed") throw new Error("This ticket is listed for resale. Withdraw the listing first.");
    if (r.error === "started") throw new Error("The event has started.");
    if (r.error === "not_valid" || r.error === "not_found") throw new Error("This ticket can no longer be transferred.");
    if (r.error) throw new Error("Could not transfer — try again.");
    revalidatePath("/app");
    if (row.wallet_item_id) revalidatePath(`/app/item/${row.wallet_item_id}`);
    return;
  }
  if (!isMissingFunction(tx.error)) throw new Error(tx.error.message);

  // The old code dies with the transfer; the new holder gets a fresh one.
  const { data: voided } = await service
    .from("tickets")
    .update({ status: "transferred" } as never)
    .eq("id", row.id)
    .eq("status", "valid")
    .select("id");
  if (!voided || voided.length === 0) throw new Error("Could not transfer — try again.");
  if (row.wallet_item_id) {
    await service
      .from("wallet_items")
      .update({ status: "archived" } as never)
      .eq("id", row.wallet_item_id);
  }
  const code = makeTicketCode(currentSigningSecret());
  const ev = row.events;
  const { data: wallet } = await service
    .from("wallet_items")
    .insert({
      user_id: target.id,
      kind: "ticket",
      status: deriveStatus(ev?.starts_at ?? null, ev?.ends_at ?? null),
      title: ev?.title ?? "Ticket",
      subtitle:
        [row.ticket_tiers?.name, ev?.venue_name, ev?.venue_city].filter(Boolean).join(" · ") ||
        null,
      venue_id: ev?.venue_id ?? null,
      starts_at: ev?.starts_at ?? null,
      ends_at: ev?.ends_at ?? null,
      purchased_via_platform: true,
      meta: {
        audience: "inner",
        vendor: "gigtrotter",
        gigtrotter_ticket_code: code,
        tier: row.ticket_tiers?.name ?? null,
        event_id: row.event_id,
        transferred_from: user.id,
      },
    } as never)
    .select("id")
    .single();
  await service.from("tickets").insert({
    event_id: row.event_id,
    tier_id: row.tier_id,
    owner_id: target.id,
    wallet_item_id: wallet?.id ?? null,
    code,
    issued_as: "transfer",
    transferred_from: user.id,
  } as never);
  revalidatePath("/app");
  if (row.wallet_item_id) revalidatePath(`/app/item/${row.wallet_item_id}`);
}

/* ── promoter: door staff (PAY-04) ──────────────────────────────────────── */

export async function addDoorStaff(eventId: string, username: string): Promise<{ userId: string }> {
  const { user } = await requirePromoterOf(eventId);
  const supabase = await createClient();
  const u = username.toLowerCase().trim().replace(/^@/, "");
  const { data: target } = await supabase.from("profiles").select("id").eq("username", u).maybeSingle();
  if (!target) throw new Error("No one with that username.");
  if (target.id === user.id) throw new Error("You already run the door as the promoter.");
  // RLS (event_staff: promoter manages) is the authority; the .select() guard
  // makes a refused insert visible instead of silently doing nothing.
  const { data, error } = await supabase
    .from("event_staff")
    .upsert({ event_id: eventId, user_id: target.id, role: "door", added_by: user.id } as never, {
      onConflict: "event_id,user_id",
    })
    .select("user_id");
  if (error) throw new Error(error.code === "42P01" ? "Door staff needs migration 0031." : error.message);
  if (!data || data.length === 0) throw new Error("Not added: is this your event?");
  revalidatePath(`/app/events/${eventId}/tickets`);
  return { userId: target.id };
}

export async function removeDoorStaff(eventId: string, userId: string): Promise<void> {
  await requirePromoterOf(eventId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_staff")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Not removed: is this your event?");
  revalidatePath(`/app/events/${eventId}/tickets`);
}
