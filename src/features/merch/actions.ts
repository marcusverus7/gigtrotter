"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import crypto from "crypto";

import { createClient } from "@/lib/supabase/server";

const OrderInput = z.object({
  items: z.array(
    z.object({
      merchItemId: z.string().uuid(),
      variantId: z.string().uuid().nullable(),
      dropId: z.string().uuid().nullable(),
      quantity: z.number().int().min(1).max(10),
    }),
  ).min(1),
  fulfilment: z.enum(["ship_to_home", "collect_at_venue"]),
  shippingName: z.string().max(200).optional(),
  shippingLine1: z.string().max(200).optional(),
  shippingLine2: z.string().max(200).optional(),
  shippingCity: z.string().max(100).optional(),
  shippingPostcode: z.string().max(20).optional(),
  shippingCountry: z.string().max(2).optional(),
  collectionVenueId: z.string().uuid().optional(),
  collectionWalletItemId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});

export async function placeMerchOrder(input: z.infer<typeof OrderInput>) {
  const parsed = OrderInput.parse(input);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (
    parsed.fulfilment === "ship_to_home" &&
    (!parsed.shippingName || !parsed.shippingLine1 || !parsed.shippingCity || !parsed.shippingPostcode)
  ) {
    throw new Error("Shipping address is required for home delivery.");
  }

  let subtotal = 0;
  let totalFee = 0;
  const lineItems: {
    merch_item_id: string;
    variant_id: string | null;
    drop_id: string | null;
    quantity: number;
    unit_price_cents: number;
  }[] = [];

  for (const item of parsed.items) {
    const { data: merch } = await supabase
      .from("merch_items")
      .select("id, price_cents, currency, fee_bps, published")
      .eq("id", item.merchItemId)
      .eq("published", true)
      .maybeSingle();
    if (!merch) throw new Error("Item not found or unavailable.");

    let unitPrice = merch.price_cents;

    if (item.variantId) {
      const { data: variant } = await supabase
        .from("merch_variants")
        .select("id, price_cents, stock, sold_count")
        .eq("id", item.variantId)
        .eq("merch_item_id", item.merchItemId)
        .maybeSingle();
      if (!variant) throw new Error("Variant not found.");
      if (variant.stock !== null && variant.sold_count + item.quantity > variant.stock) {
        throw new Error("Not enough stock for this variant.");
      }
      if (variant.price_cents !== null) unitPrice = variant.price_cents;
    }

    if (item.dropId) {
      const { data: drop } = await supabase
        .from("merch_drops")
        .select("id, status, total_stock, total_sold, opens_at, closes_at")
        .eq("id", item.dropId)
        .eq("merch_item_id", item.merchItemId)
        .maybeSingle();
      if (!drop) throw new Error("Drop not found.");
      if (drop.status !== "live") throw new Error("This drop isn't live yet.");
      if (drop.total_stock !== null && drop.total_sold + item.quantity > drop.total_stock) {
        throw new Error("This drop is sold out.");
      }
    }

    subtotal += unitPrice * item.quantity;
    totalFee += Math.round((unitPrice * merch.fee_bps) / 10_000) * item.quantity;
    lineItems.push({
      merch_item_id: item.merchItemId,
      variant_id: item.variantId,
      drop_id: item.dropId,
      quantity: item.quantity,
      unit_price_cents: unitPrice,
    });
  }

  const collectionCode =
    parsed.fulfilment === "collect_at_venue"
      ? crypto.randomBytes(16).toString("hex")
      : null;

  const { data: order, error } = await supabase
    .from("merch_orders")
    .insert({
      buyer_id: user.id,
      status: "pending",
      fulfilment: parsed.fulfilment,
      shipping_name: parsed.shippingName ?? null,
      shipping_line1: parsed.shippingLine1 ?? null,
      shipping_line2: parsed.shippingLine2 ?? null,
      shipping_city: parsed.shippingCity ?? null,
      shipping_postcode: parsed.shippingPostcode ?? null,
      shipping_country: parsed.shippingCountry ?? null,
      collection_venue_id: parsed.collectionVenueId ?? null,
      collection_wallet_item_id: parsed.collectionWalletItemId ?? null,
      collection_code: collectionCode,
      subtotal_cents: subtotal,
      fee_cents: totalFee,
      total_cents: subtotal + totalFee,
      notes: parsed.notes ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  // One insert per line, no transaction available through PostgREST -- so
  // check each. Unchecked, a failure on line two of three left a paid order
  // holding a partial list of what was bought, and still returned success.
  const { error: lineError } = await supabase
    .from("merch_order_items")
    .insert(lineItems.map((li) => ({ order_id: order.id, ...li })));
  if (lineError) {
    // Nothing was charged yet, so the recoverable state is no order at all
    // rather than an order with no contents.
    await supabase.from("merch_orders").delete().eq("id", order.id);
    throw lineError;
  }

  revalidatePath("/app/merch");
  return { orderId: order.id, collectionCode };
}
