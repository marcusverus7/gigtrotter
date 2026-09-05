"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { deriveStatus, effectiveEnd } from "@/lib/wallet/lifecycle";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { FlexibleDate } from "@/lib/validation/dates";
import type {
  Audience,
  WalletKind,
  WalletStatus,
} from "@/lib/supabase/types";

export interface VenueSuggestion {
  mapboxId: string;
  name: string;
  full: string;
  lng: number;
  lat: number;
  city: string | null;
  country: string | null;
}

/**
 * This was the one server action with no validation at all: kind, title,
 * audience, the whole venue object and an unparsed starts_at string went
 * straight to the database on trust. Same rules as the confirm path, which is
 * the point — two ways in should not mean two ideas of what is acceptable.
 */
const ManualInput = z.object({
  kind: z.enum(["ticket", "flight", "stay", "restaurant", "other"]),
  title: z.string().trim().min(1).max(200),
  starts_at: FlexibleDate,
  audience: z.enum(["vault", "inner", "friends", "open"]),
  venue: z
    .object({
      mapboxId: z.string().min(1).max(200),
      name: z.string().trim().min(1).max(200),
      full: z.string().trim().max(400),
      lng: z.number().min(-180).max(180),
      lat: z.number().min(-90).max(90),
      city: z.string().max(120).nullable(),
      country: z.string().max(120).nullable(),
    })
    .nullable(),
  /**
   * False when the user is saving something they WANT to go to but has no
   * ticket for. Without this a dated gig was always filed as "going", so there
   * was no way to wishlist a specific gig — the top question from beta testers
   * ("how do we populate the wishlist?").
   */
  hasTicket: z.boolean().optional(),
});

export async function addManualWalletItem(raw: {
  kind: WalletKind;
  title: string;
  starts_at: string | null;
  audience: Audience;
  venue: VenueSuggestion | null;
  hasTicket?: boolean;
}) {
  const check = ManualInput.safeParse(raw);
  if (!check.success) {
    const first = check.error.issues[0];
    throw new Error(`${first.path.join(".") || "input"}: ${first.message}`);
  }
  const input = check.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // 1) Upsert venue if one supplied.
  //
  // venues allows public reads but NO client writes (service role only —
  // migration 0002). Inserting with the session client here was silently
  // denied, exactly as it was in confirmCapture: every manually added gig got
  // venue_id null and could never become a map pin. Coordinates already come
  // from the Mapbox venue picker, so no geocoding is needed on this path.
  let venueId: string | null = null;
  if (input.venue) {
    const service = createServiceClient();
    const { data: existing } = await service
      .from("venues")
      .select("id")
      .eq("mapbox_id", input.venue.mapboxId)
      .maybeSingle();
    if (existing) {
      venueId = existing.id;
    } else {
      const { data: v, error: venueErr } = await service
        .from("venues")
        .insert({
          name: input.venue.name,
          city: input.venue.city,
          country: input.venue.country,
          lat: input.venue.lat,
          lng: input.venue.lng,
          city_lat: input.venue.lat,
          city_lng: input.venue.lng,
          mapbox_id: input.venue.mapboxId,
        })
        .select("id")
        .single();
      if (venueErr) {
        console.error("[addManualWalletItem] venue insert failed:", venueErr.message);
      }
      venueId = v?.id ?? null;
    }
  }

  // 2) Create a capture row with source='manual' so the lifecycle is uniform.
  const { data: capture } = await supabase
    .from("captures")
    .insert({
      user_id: user.id,
      source: "manual",
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // 3) Decide status from the date — unless the user said they have no ticket,
  //    in which case it is a wishlist item however firm the date is.
  const startsAt = input.starts_at ? new Date(input.starts_at).getTime() : null;
  const hasTicket = input.hasTicket ?? true;
  const status: WalletStatus = !hasTicket ? "wishlist" : deriveStatus(input.starts_at, null);

  // 4) wallet_item.
  const { data: wallet, error: walletErr } = await supabase
    .from("wallet_items")
    .insert({
      user_id: user.id,
      capture_id: capture?.id ?? null,
      venue_id: venueId,
      kind: input.kind,
      status,
      title: input.title,
      subtitle: input.venue?.full ?? null,
      starts_at: input.starts_at,
    })
    .select("id")
    .single();

  if (walletErr || !wallet) {
    throw new Error(walletErr?.message ?? "Could not save item.");
  }

  // 5) If past, mint the experience pin immediately.
  if (status === "attended" && startsAt) {
    await supabase.from("experiences").insert({
      user_id: user.id,
      wallet_item_id: wallet.id,
      capture_id: capture?.id ?? null,
      venue_id: venueId,
      kind: input.kind,
      title: input.title,
      subtitle: input.venue?.full ?? null,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(effectiveEnd(input.starts_at!, null)).toISOString(),
      audience: input.audience,
      verified_by: "manual",
    });
  }

  await supabase.rpc("trip_assemble", { target_user: user.id });

  revalidatePath("/app");
  revalidatePath("/app/map");
  return { walletItemId: wallet.id };
}
