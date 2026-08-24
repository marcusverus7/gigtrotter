"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const ListInput = z.object({
  walletItemId: z.string().uuid(),
  faceValueCents: z.number().int().min(0).max(1_000_000),
  askingPriceCents: z.number().int().min(0).max(1_000_000),
  currency: z.string().optional(),
  notes: z.string().max(280).nullable().optional(),
});

/**
 * List a ticket on the marketplace. The DB check constraint enforces
 * asking_price ≤ face_value (the anti-scalper rule). We mirror it here
 * for a friendlier error message, but the DB is the source of truth.
 */
export async function createListing(input: z.infer<typeof ListInput>) {
  const parsed = ListInput.parse(input);
  if (parsed.askingPriceCents > parsed.faceValueCents) {
    throw new Error(
      "Asking price can't exceed face value. GigTrotter is face-value-only.",
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Verify the user actually owns the wallet item.
  const { data: walletItem } = await supabase
    .from("wallet_items")
    .select("id, kind, status")
    .eq("id", parsed.walletItemId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!walletItem) throw new Error("That ticket isn't in your wallet.");
  if (walletItem.kind !== "ticket") {
    throw new Error("Only tickets can be resold (no flights/stays).");
  }
  if (walletItem.status !== "going") {
    throw new Error(
      "You can only list tickets that are still 'going' — not past or already listed.",
    );
  }

  // Cross-check the DECLARED face value against the artefact the seller
  // actually holds. The DB constraint only enforces asking <= face_value, so
  // without this the anti-scalper rule is satisfied by declaring a higher face
  // value — a £50 ticket listed as "face value £500, asking £500" would pass.
  // The parser records the total printed on the ticket (price_total_cents);
  // face value can't exceed what they paid.
  const { data: exp } = await supabase
    .from("experiences")
    .select("capture_id")
    .eq("wallet_item_id", parsed.walletItemId)
    .eq("user_id", user.id)
    .maybeSingle();

  let evidenceCents: number | null = null;
  if (exp?.capture_id) {
    const { data: cap } = await supabase
      .from("captures")
      .select("parse_json")
      .eq("id", exp.capture_id)
      .eq("user_id", user.id)
      .maybeSingle();
    const pj = cap?.parse_json as { price_total_cents?: number | null } | null;
    evidenceCents = pj?.price_total_cents ?? null;
  }

  if (evidenceCents !== null && parsed.faceValueCents > evidenceCents) {
    const fmt = (c: number) =>
      new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: parsed.currency ?? "GBP",
      }).format(c / 100);
    throw new Error(
      `Your ticket shows ${fmt(evidenceCents)}. Face value can't be listed above what you paid.`,
    );
  }

  const { data, error } = await supabase
    .from("listings")
    .insert({
      seller_id: user.id,
      wallet_item_id: parsed.walletItemId,
      face_value_cents: parsed.faceValueCents,
      asking_price_cents: parsed.askingPriceCents,
      currency: parsed.currency ?? "GBP",
      notes: parsed.notes ?? null,
      status: "live",
    })
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Listing was blocked.");

  revalidatePath("/app/marketplace");
  revalidatePath("/app");
}

export async function cancelListing(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  // .select() guard: a write blocked by RLS returns success-shaped output with
  // no rows, so without this "denied" and "done" are indistinguishable and the
  // UI reports the change happened.
  const { data, error } = await supabase
    .from("listings")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("seller_id", user.id)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Listing not found.");
  revalidatePath("/app/marketplace");
}

/**
 * Buyer expresses interest. Phase 9 wires Stripe Connect — this stub just
 * creates the offer row so we have the audit trail.
 */
export async function placeOffer(listingId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: listing } = await supabase
    .from("listings")
    .select("asking_price_cents, fee_bps, seller_id, status")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) throw new Error("That listing doesn't exist.");
  if (listing.status !== "live") throw new Error("Listing isn't live.");
  if (listing.seller_id === user.id) throw new Error("Can't buy your own ticket.");

  const fee = Math.round((listing.asking_price_cents * listing.fee_bps) / 10_000);
  await supabase.from("offers").insert({
    listing_id: listingId,
    buyer_id: user.id,
    amount_cents: listing.asking_price_cents,
    fee_cents: fee,
  });

  revalidatePath("/app/marketplace");
}

/**
 * Friend-to-friend ticket transfer (no money). Both must be accepted friends;
 * recipient must accept the transfer for it to take effect.
 */
export async function initiateTransfer(input: {
  walletItemId: string;
  toUserId: string;
  message?: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (input.toUserId === user.id) {
    throw new Error("Pick someone other than yourself.");
  }

  // Verify ownership.
  const { data: wallet } = await supabase
    .from("wallet_items")
    .select("id, kind")
    .eq("id", input.walletItemId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!wallet) throw new Error("That ticket isn't in your wallet.");
  if (wallet.kind !== "ticket") {
    throw new Error("Only tickets can be transferred.");
  }

  // Verify accepted friendship.
  const [a, b] =
    user.id < input.toUserId ? [user.id, input.toUserId] : [input.toUserId, user.id];
  const { data: f } = await supabase
    .from("friendships")
    .select("state")
    .eq("user_a", a)
    .eq("user_b", b)
    .maybeSingle();
  if (!f || f.state !== "accepted") {
    throw new Error("Transfers go to accepted friends only.");
  }

  await supabase.from("transfers").insert({
    from_user_id: user.id,
    to_user_id: input.toUserId,
    wallet_item_id: input.walletItemId,
    message: input.message ?? null,
  });

  revalidatePath("/app");
}
