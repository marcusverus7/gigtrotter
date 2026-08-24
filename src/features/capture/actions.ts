"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { geocodePlace } from "@/lib/geo/geocode";
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
/**
 * Dates arrive in whatever shape the source produced: the vision parser emits
 * LOCAL ISO with no offset by design ("2026-08-31T19:00:00" — the prompt says
 * drop timezones), and <input type="datetime-local"> emits "2026-08-31T19:00".
 * The old `z.string().datetime({ offset: true })` rejected BOTH, so confirming
 * almost any parsed capture threw — surfacing in production as the masked
 * "Server Components render" error (tester-reported, 2026-08-20). Accept any
 * string Date.parse understands; Postgres handles offsetless ISO fine.
 */
const FlexibleDate = z
  .string()
  .trim()
  .refine((s) => s === "" || !Number.isNaN(Date.parse(s)), {
    message: "Unrecognised date — use the date picker.",
  })
  .nullable();

const ConfirmInput = z.object({
  captureId: z.string().uuid(),
  kind: z.enum(["ticket", "flight", "stay", "restaurant", "other"]),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(200).optional().nullable(),
  starts_at: FlexibleDate,
  ends_at: FlexibleDate,
  /** Parser extras ("Standing", "Entrance GA8", seat rows…) + printed price.
   *  Persisted to wallet_items.meta so they survive confirmation — they used
   *  to be shown on the card and then silently dropped (tester-reported). */
  details: z.array(z.string().max(200)).max(30).default([]),
  price_total_cents: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
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
  const check = ConfirmInput.safeParse(input);
  if (!check.success) {
    // A friendly message, not a ZodError blob (which production masks anyway).
    const first = check.error.issues[0];
    throw new Error(`${first.path.join(".") || "input"}: ${first.message}`);
  }
  const parsed = check.data;

  // A gig can't end before it starts (tester-reported: the editable Ends field
  // accepted anything). Null ends stays allowed — most tickets don't print one.
  if (
    parsed.starts_at &&
    parsed.ends_at &&
    Date.parse(parsed.ends_at) < Date.parse(parsed.starts_at)
  ) {
    throw new Error("End time can't be before the start time.");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // 0) The capture id arrives from the client and was previously trusted on
  //    sight -- validated as a UUID and then written into wallet_items and
  //    experiences with no lookup. Two things follow from checking it here:
  //    the row has to be yours, and it has to still be pending, so pressing
  //    Confirm twice no longer produces two wallet items and two map pins.
  const { data: capture } = await supabase
    .from("captures")
    .select("id, status")
    .eq("id", parsed.captureId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!capture) throw new Error("Capture not found.");
  if (capture.status !== "pending") {
    throw new Error("This capture has already been dealt with.");
  }

  // 1) Upsert the venue if one was supplied.
  //
  // venues is a shared canonical table: RLS allows public READS but no client
  // writes ("Inserts via service role / RPC only" — migration 0002). This used
  // to insert with the session client and discard the error, so EVERY venue
  // insert was silently denied: wallet items and experiences were created with
  // venue_id null and the map stayed at "0 pins" forever (tester-reported,
  // build 21). Service client + explicit error surfacing, and coordinates are
  // geocoded at creation because a venue without lat/lng can't be a pin.
  let venueId: string | null = null;
  if (parsed.venue?.name) {
    const service = createServiceClient();
    const { data: existing } = await service
      .from("venues")
      .select("id, lat, lng")
      .eq("name", parsed.venue.name)
      .eq("city", parsed.venue.city ?? "")
      .maybeSingle();
    if (existing) {
      venueId = existing.id;
      if (existing.lat == null || existing.lng == null) {
        const geo = await geocodePlace(
          [parsed.venue.name, parsed.venue.city, parsed.venue.country]
            .filter(Boolean)
            .join(", "),
        );
        if (geo) {
          await service
            .from("venues")
            .update({ lat: geo.lat, lng: geo.lng })
            .eq("id", existing.id);
        }
      }
    } else {
      const [venueGeo, cityGeo] = await Promise.all([
        geocodePlace(
          [parsed.venue.name, parsed.venue.city, parsed.venue.country]
            .filter(Boolean)
            .join(", "),
        ),
        geocodePlace(
          [parsed.venue.city, parsed.venue.country].filter(Boolean).join(", "),
        ),
      ]);
      const { data: v, error: venueErr } = await service
        .from("venues")
        .insert({
          name: parsed.venue.name,
          city: parsed.venue.city ?? null,
          country: parsed.venue.country ?? null,
          lat: venueGeo?.lat ?? null,
          lng: venueGeo?.lng ?? null,
          // City-level coords power the anonymised public board fuzzing.
          city_lat: cityGeo?.lat ?? null,
          city_lng: cityGeo?.lng ?? null,
        })
        .select("id")
        .single();
      if (venueErr) {
        console.error("[confirmCapture] venue insert failed:", venueErr.message);
      }
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
      meta: {
        ...(parsed.details.length > 0 ? { details: parsed.details } : {}),
        ...(parsed.price_total_cents != null
          ? { price_total_cents: parsed.price_total_cents, currency: parsed.currency ?? null }
          : {}),
      },
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

  // 5) Mark the capture confirmed. `.eq("status", "pending")` plus the
  //    .select() guard closes the gap between the check above and this write:
  //    two concurrent confirms cannot both flip the row.
  const { data: confirmed } = await supabase
    .from("captures")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", parsed.captureId)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("id");
  if (!confirmed || confirmed.length === 0) {
    console.error("[capture] confirm write did not land", parsed.captureId);
  }

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
