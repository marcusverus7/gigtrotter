/**
 * setlist.fm shapes → ours. PURE — tested in eval/logic.test.ts.
 *
 * The API dates things "dd-MM-yyyy" and nests songs under sets.set[].song[];
 * a cover carries the original artist. We keep song names, a flag for
 * covers, the setlist id and the public URL — enough for "relive it" and a
 * credit link, which the API terms require.
 */

export type SetlistfmSetlist = {
  id?: string;
  url?: string;
  eventDate?: string; // dd-MM-yyyy
  artist?: { name?: string; mbid?: string };
  venue?: { name?: string; city?: { name?: string; country?: { code?: string; name?: string } } };
  tour?: { name?: string };
  sets?: { set?: Array<{ encore?: number; song?: Array<{ name?: string; cover?: { name?: string }; tape?: boolean }> }> };
};

export type StoredSetlist = {
  setlistfm_id: string;
  url: string | null;
  artist: string | null;
  tour: string | null;
  songs: Array<{ name: string; cover: string | null; encore: boolean }>;
};

/** "2026-07-04T19:00:00.000Z" → "04-07-2026" in the given zone (default UTC). */
export function toSetlistfmDate(iso: string, timeZone = "UTC"): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")}`;
}

/** "04-07-2026" → "2026-07-04T19:00:00" (evening placeholder, local wall clock). */
export function fromSetlistfmDate(d: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(d ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}T19:00:00` : null;
}

export function toStoredSetlist(s: SetlistfmSetlist): StoredSetlist | null {
  if (!s.id) return null;
  const songs: StoredSetlist["songs"] = [];
  for (const set of s.sets?.set ?? []) {
    for (const song of set.song ?? []) {
      if (!song.name || song.tape) continue;
      songs.push({ name: song.name, cover: song.cover?.name ?? null, encore: !!set.encore });
    }
  }
  return {
    setlistfm_id: s.id,
    url: s.url ?? null,
    artist: s.artist?.name ?? null,
    tour: s.tour?.name ?? null,
    songs,
  };
}

/** "Headliner + Support" → "Headliner". */
export function headlinerOf(title: string): string {
  return title.split(" + ")[0].trim();
}

/**
 * Pick the setlist that matches a gig: same artist (loosely), same date, and
 * preferably the same city. The search endpoint already filters by artist
 * and date; this guards against the odd mismatch and empty setlists.
 */
export function pickSetlist(
  candidates: SetlistfmSetlist[],
  wanted: { artist: string; date: string; city?: string | null },
): SetlistfmSetlist | null {
  const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const scored = candidates
    .filter((c) => c.id && c.eventDate === wanted.date)
    .map((c) => {
      let score = 0;
      if (norm(c.artist?.name) === norm(wanted.artist)) score += 2;
      if (wanted.city && norm(c.venue?.city?.name) === norm(wanted.city)) score += 1;
      const songCount = (c.sets?.set ?? []).reduce((n, s) => n + (s.song?.length ?? 0), 0);
      if (songCount > 0) score += 1;
      return { c, score, songCount };
    })
    .sort((a, b) => b.score - a.score || b.songCount - a.songCount);
  return scored[0]?.c ?? null;
}

/** An attended setlist → the wallet row we would create for it. */
export function attendedToWalletRow(s: SetlistfmSetlist): {
  title: string;
  starts_at: string;
  venue: { name: string; city: string | null; country: string | null } | null;
  setlistfm_id: string;
} | null {
  const starts = s.eventDate ? fromSetlistfmDate(s.eventDate) : null;
  if (!s.id || !s.artist?.name || !starts) return null;
  return {
    title: s.artist.name,
    starts_at: starts,
    venue: s.venue?.name
      ? { name: s.venue.name, city: s.venue.city?.name ?? null, country: s.venue.city?.country?.code ?? null }
      : null,
    setlistfm_id: s.id,
  };
}

/**
 * A pasted CSV / TSV of past gigs. Header optional; columns recognised by
 * name (date, artist, venue, city, country) or by position in that order.
 * Dates accepted: yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy.
 */
export function parseGigCsv(text: string): Array<{
  title: string;
  starts_at: string;
  venue: { name: string; city: string | null; country: string | null } | null;
}> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const split = (l: string) =>
    l.split(sep === "," ? /,(?=(?:[^"]*"[^"]*")*[^"]*$)/ : "\t").map((c) => c.trim().replace(/^"|"$/g, ""));
  let cols = ["date", "artist", "venue", "city", "country"];
  let rows = lines;
  const first = split(lines[0]).map((c) => c.toLowerCase());
  if (first.some((c) => ["date", "artist", "venue", "city", "country", "band", "show"].includes(c))) {
    cols = first.map((c) => (c === "band" || c === "show" ? "artist" : c));
    rows = lines.slice(1);
  }
  const out: ReturnType<typeof parseGigCsv> = [];
  for (const line of rows) {
    const cells = split(line);
    const get = (name: string) => {
      const i = cols.indexOf(name);
      return i >= 0 ? (cells[i] ?? "").trim() : "";
    };
    const date = normaliseDate(get("date"));
    const artist = get("artist");
    if (!date || !artist) continue;
    const venueName = get("venue");
    out.push({
      title: artist,
      starts_at: `${date}T19:00:00`,
      venue: venueName ? { name: venueName, city: get("city") || null, country: get("country") || null } : null,
    });
  }
  return out;
}

function normaliseDate(v: string): string | null {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}
