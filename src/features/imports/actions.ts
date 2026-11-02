"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { cityCentroid } from "@/lib/events/normalize";
import { attendedSetlists, setlistfmConfigured } from "@/lib/setlistfm/client";
import { attendedToWalletRow, parseGigCsv, toStoredSetlist } from "@/lib/setlistfm/map";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { effectiveEnd } from "@/lib/wallet/lifecycle";

/**
 * History back-fill. Both sources end in the same place: confirmed past
 * wallet items with a pin each, status 'attended', verified 'manual' —
 * exactly what hand-adding a past gig produces. Duplicates are skipped by
 * headliner + calendar day against what the wallet already holds, so running
 * an import twice adds nothing.
 */

type Incoming = {
  title: string;
  starts_at: string; // local wall clock, no offset
  venue: { name: string; city: string | null; country: string | null } | null;
  setlist?: ReturnType<typeof toStoredSetlist>;
};

async function importRows(
  source: "setlistfm" | "csv",
  rows: Incoming[],
): Promise<{ found: number; imported: number; duplicates: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: job } = await supabase
    .from("import_jobs")
    .insert({ user_id: user.id, source, status: "running", found: rows.length } as never)
    .select("id")
    .single();

  const { data: existing } = await supabase
    .from("wallet_items")
    .select("title, starts_at")
    .eq("user_id", user.id)
    .limit(2000);
  const seen = new Set(
    (existing ?? []).map((w) => `${w.title.split(" + ")[0].trim().toLowerCase()}|${(w.starts_at ?? "").slice(0, 10)}`),
  );

  const service = createServiceClient();
  let imported = 0;
  let duplicates = 0;
  for (const r of rows) {
    const key = `${r.title.split(" + ")[0].trim().toLowerCase()}|${r.starts_at.slice(0, 10)}`;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);

    let venueId: string | null = null;
    if (r.venue?.name) {
      const { data: v } = await service
        .from("venues")
        .select("id")
        .eq("name", r.venue.name)
        .eq("city", r.venue.city ?? "")
        .maybeSingle();
      if (v) venueId = v.id;
      else {
        const c = cityCentroid(r.venue.city);
        const { data: created } = await service
          .from("venues")
          .upsert(
            { name: r.venue.name, city: r.venue.city, country: r.venue.country, city_lat: c?.lat ?? null, city_lng: c?.lng ?? null },
            { onConflict: "name,city,country", ignoreDuplicates: true },
          )
          .select("id")
          .maybeSingle();
        venueId = created?.id ?? null;
      }
    }

    // Local evening wall clock → stored as an instant. Imports have no
    // viewer zone to anchor to, so the UK default is used.
    const starts = new Date(r.starts_at + "+00:00").toISOString();
    const ends = new Date(effectiveEnd(starts, null)).toISOString();
    const { data: item } = await supabase
      .from("wallet_items")
      .insert({
        user_id: user.id,
        venue_id: venueId,
        kind: "ticket",
        status: "attended",
        title: r.title,
        subtitle: [r.venue?.name, r.venue?.city].filter(Boolean).join(" · ") || null,
        starts_at: starts,
        meta: { audience: "inner", imported_from: source },
      })
      .select("id")
      .single();
    if (!item) continue;
    await supabase.from("experiences").insert({
      user_id: user.id,
      wallet_item_id: item.id,
      venue_id: venueId,
      kind: "ticket",
      title: r.title,
      subtitle: [r.venue?.name, r.venue?.city].filter(Boolean).join(" · ") || null,
      starts_at: starts,
      ends_at: ends,
      audience: "inner",
      verified_by: "manual",
      ...(r.setlist
        ? { setlist: r.setlist, setlistfm_id: r.setlist.setlistfm_id, setlist_checked_at: new Date().toISOString() }
        : {}),
    } as never);
    imported += 1;
  }

  if (job?.id) {
    await supabase
      .from("import_jobs")
      .update({ status: "done", imported, duplicates, finished_at: new Date().toISOString() } as never)
      .eq("id", job.id);
  }
  revalidatePath("/app");
  revalidatePath("/app/map");
  revalidatePath("/app/memories");
  revalidatePath("/app/import");
  return { found: rows.length, imported, duplicates };
}

const Username = z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_.-]+$/);

export async function importFromSetlistfm(username: string) {
  if (!setlistfmConfigured()) throw new Error("setlist.fm import is not switched on yet.");
  const u = Username.parse(username);
  const attended = await attendedSetlists(u);
  if (attended.length === 0) throw new Error("No attended shows found for that username (is the list public?).");
  const rows: Incoming[] = [];
  for (const s of attended) {
    const row = attendedToWalletRow(s);
    if (row) rows.push({ ...row, setlist: toStoredSetlist(s) });
  }
  return importRows("setlistfm", rows);
}

export async function importFromCsv(text: string) {
  const rows = parseGigCsv(z.string().max(200_000).parse(text));
  if (rows.length === 0) throw new Error("Nothing recognisable — one gig per line: date, artist, venue, city.");
  return importRows("csv", rows.slice(0, 500));
}
