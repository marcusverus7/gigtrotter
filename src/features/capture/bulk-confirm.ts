"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ParsedCaptureSchema } from "@/lib/capture/schema";
import { zonedWallClockToUtc } from "@/lib/events/ticketmaster/map";
import { createClient } from "@/lib/supabase/server";

import { confirmCapture } from "./actions";

/**
 * Confirm every pending card the parser was confident about, as parsed.
 *
 * After a fifty-image backfill the user had to confirm cards one at a time,
 * twenty per page — the cold-start promise ("your map fills in minutes") was
 * defeated by its own confirm step. This takes the viewer's IANA zone so the
 * parser's offsetless wall-clock times are anchored the same way the confirm
 * card anchors them, and goes through confirmCapture so every rule (status,
 * venue, pin, trip) is the same one tap-by-tap confirmation uses.
 */
const Input = z.object({
  minConfidence: z.number().min(0.5).max(1).default(0.8),
  timeZone: z.string().min(1).max(64),
});

export async function confirmConfidentCaptures(input: z.infer<typeof Input>) {
  const { minConfidence, timeZone } = Input.parse(input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: pending } = await supabase
    .from("captures")
    .select("id, parse_json, confidence")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .gte("confidence", minConfidence)
    .order("created_at", { ascending: true })
    .limit(100);

  let confirmed = 0;
  let skipped = 0;
  for (const c of pending ?? []) {
    const parsed = ParsedCaptureSchema.safeParse(c.parse_json);
    if (!parsed.success || parsed.data.confidence === 0 || !parsed.data.starts_at) {
      skipped += 1;
      continue;
    }
    const p = parsed.data;
    const anchor = (v: string | null) => {
      if (!v) return null;
      if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(v)) return v;
      const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(v);
      if (!m) return null;
      return zonedWallClockToUtc(m[1], m[2] ?? "19:00", timeZone);
    };
    try {
      await confirmCapture({
        captureId: c.id,
        kind: p.kind,
        title: p.title,
        subtitle: p.destination?.city ?? p.destination?.name ?? null,
        starts_at: anchor(p.starts_at),
        ends_at: anchor(p.ends_at),
        details: p.details ?? [],
        price_total_cents: p.price_total_cents ?? null,
        currency: p.currency ?? null,
        audience: "inner",
        vendor: p.vendor ?? null,
        venue: p.destination?.name
          ? { name: p.destination.name, city: p.destination.city ?? null, country: p.destination.country ?? null }
          : null,
      });
      confirmed += 1;
    } catch {
      skipped += 1;
    }
  }
  revalidatePath("/app/capture");
  revalidatePath("/app");
  return { confirmed, skipped };
}
