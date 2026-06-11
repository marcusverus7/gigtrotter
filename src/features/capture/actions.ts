"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type {
  Audience,
  WalletKind,
  WalletStatus,
} from "@/lib/supabase/types";

/**
 * Confirm a pending capture → wallet_item.
 *
 * The user can edit any extracted field before confirming. This is the trust
 * surface (§6.1): every parse lands as a confirm card, never a silent write.
 */
const ConfirmInput = z.object({
  captureId: z.string().uuid(),
  kind: z.enum(["ticket", "flight", "stay", "restaurant", "other"]),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(200).optional().nullable(),
  starts_at: z.string().datetime({ offset: true }).nullable().or(z.literal("")),
  ends_at: z.string().datetime({ offset: true }).nullable().or(z.literal("")),
  audience: z.enum(["vault", "inner", "friends", "open"]).default("inner"),
  venue: z
    .object({
      name: z.string(),
      city: z.string().nullable().optional(),
      country: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export type ConfirmCaptureInput = z.infer<typeof ConfirmInput>;

export async function confirmCapture(input: ConfirmCaptureInput) {
  const parsed = ConfirmInput.parse(input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // 1) Upsert the venue if one was supplied.
  let venueId: string | null = null;
  if (parsed.venue?.name) {
    const { data: existing } = await supabase
      .from("venues")
      .select("id")
      .eq("name", parsed.venue.name)
      .eq("city", parsed.venue.city ?? "")
      .maybeSingle();
    if (existing) {
      venueId = existing.id;
    } else {
      const { data: v } = await supabase
        .from("venues")
        .insert({
          name: parsed.venue.name,
          city: parsed.venue.city ?? null,
          country: parsed.venue.country ?? null,
        })
        .select("id")
        .single();
      venueId = v?.id ?? null;
    }
  }

  // 2) Decide the lifecycle status from the dates.
  const now = Date.now();
  const startsAt = parsed.starts_at ? new Date(parsed.starts_at).getTime() : null;
  const endsAt = parsed.ends_at ? new Date(parsed.ends_at).getTime() : null;
  let status: WalletStatus = "going";
  if (!startsAt) status = "wishlist";
  else if (startsAt < now && (endsAt ?? startsAt + 4 * 3600_000) < now) {
    status = "attended";
  } else if (
    startsAt - now < 12 * 3600_000 ||
    (startsAt < now && (endsAt ?? startsAt) >= now)
  ) {
    status = "tonight";
  }

  // 3) Insert the wallet_item with .select() so an RLS silent-fail surfaces.
  const { data: walletItem, error: walletErr } = await supabase
    .from("wallet_items")
    .insert({
      user_id: user.id,
      capture_id: parsed.captureId,
      venue_id: venueId,
      kind: parsed.kind as WalletKind,
      status,
      title: parsed.title,
      subtitle: parsed.subtitle ?? null,
      starts_at: parsed.starts_at || null,
      ends_at: parsed.ends_at || null,
    })
    .select("id, starts_at, ends_at, kind, title, subtitle")
    .single();

  if (walletErr || !walletItem) {
    throw new Error(walletErr?.message ?? "Could not create wallet item.");
  }

  // 4) If the event is already over, mint the experience pin immediately —
  //    backfilled screenshots go straight onto the map.
  if (status === "attended" && startsAt) {
    await supabase.from("experiences").insert({
      user_id: user.id,
      wallet_item_id: walletItem.id,
      capture_id: parsed.captureId,
      venue_id: venueId,
      kind: parsed.kind as WalletKind,
      title: parsed.title,
      subtitle: parsed.subtitle ?? null,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt ?? startsAt + 3 * 3600_000).toISOString(),
      audience: parsed.audience as Audience,
      verified_by: "ticket",
    });
  }

  // 5) Mark the capture confirmed.
  await supabase
    .from("captures")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", parsed.captureId)
    .eq("user_id", user.id);

  revalidatePath("/app");
  revalidatePath("/app/map");
  revalidatePath("/app/capture");

  return { walletItemId: walletItem.id, status };
}

export async function rejectCapture(captureId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase
    .from("captures")
    .update({ status: "rejected" })
    .eq("id", captureId)
    .eq("user_id", user.id);

  revalidatePath("/app/capture");
}
