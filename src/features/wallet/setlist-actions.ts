"use server";

import { revalidatePath } from "next/cache";

import { searchSetlists, setlistfmConfigured } from "@/lib/setlistfm/client";
import {
  headlinerOf,
  pickSetlist,
  toSetlistfmDate,
  toStoredSetlist,
  type StoredSetlist,
} from "@/lib/setlistfm/map";
import { createClient } from "@/lib/supabase/server";

/**
 * Attach the setlist to a pin, once.
 *
 * Called from the pin page the first time it is opened after the gig (and by
 * the morning-after card). Looks the show up by headliner + date + city,
 * stores what it finds, and stamps setlist_checked_at either way so a show
 * setlist.fm does not have is not re-queried on every open. Returns the
 * setlist, or null, or "unconfigured" when there is no API key — the panel
 * then says nothing rather than failing.
 */
export async function fetchSetlist(
  experienceId: string,
): Promise<StoredSetlist | null | "unconfigured"> {
  if (!setlistfmConfigured()) return "unconfigured";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: exp } = await supabase
    .from("experiences")
    .select("id, title, starts_at, ends_at, setlist, setlist_checked_at, venues(city), wallet_items(meta)")
    .eq("id", experienceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!exp) throw new Error("Pin not found.");
  const row = exp as unknown as {
    title: string;
    starts_at: string;
    ends_at: string;
    setlist: StoredSetlist | null;
    setlist_checked_at: string | null;
    venues: { city: string | null } | { city: string | null }[] | null;
    wallet_items: { meta?: { timezone?: string } } | null;
  };
  if (row.setlist) return row.setlist;
  if (row.setlist_checked_at) return null;
  if (new Date(row.ends_at).getTime() > Date.now()) return null; // not yet played

  const venue = Array.isArray(row.venues) ? row.venues[0] : row.venues;
  const artist = headlinerOf(row.title);
  // Gigs are stored in UTC; the setlist date is the local evening. A London
  // 20:00 gig is the same calendar day either way; a 00:30 one is not —
  // try the stored day first, then the day before.
  const dates = [toSetlistfmDate(row.starts_at), toSetlistfmDate(new Date(new Date(row.starts_at).getTime() - 6 * 3600_000).toISOString())];
  let found: StoredSetlist | null = null;
  for (const date of [...new Set(dates)]) {
    const candidates = await searchSetlists({ artistName: artist, date, cityName: venue?.city ?? null });
    const best = pickSetlist(candidates, { artist, date, city: venue?.city ?? null });
    const stored = best ? toStoredSetlist(best) : null;
    if (stored && stored.songs.length > 0) {
      found = stored;
      break;
    }
  }

  await supabase
    .from("experiences")
    .update({
      setlist: found as never,
      setlistfm_id: found?.setlistfm_id ?? null,
      setlist_checked_at: new Date().toISOString(),
    } as never)
    .eq("id", experienceId)
    .eq("user_id", user.id);

  revalidatePath(`/app/item/${experienceId}`);
  return found;
}
