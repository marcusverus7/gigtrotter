/**
 * Offline logic tests for the capture pipeline — everything that runs WITHOUT
 * an Anthropic API key. The live vision call is exercised separately by
 * `pnpm eval` (needs ANTHROPIC_API_KEY) and by uploading corpus tickets to the
 * deployed app; this file pins down the deterministic logic around the model:
 *
 *   - MIME sniffing (magic numbers) and the PDF fail-closed path
 *   - code-fence stripping of model output
 *   - the Zod contract (schema defaults + rejections)
 *   - the eval scorer (field mapping, date/string normalisation, barcode
 *     presence-only, unscored-by-design fields)
 *
 * Run: pnpm test:logic
 */

import { detectMimeType, stripCodeFence, parseCaptureBytes, ParseError } from "../src/lib/capture/parser";
import { ParsedCaptureSchema, type ParsedCapture } from "../src/lib/capture/schema";
import {
  describeFriends,
  describeNewDates,
  followedAtIndex,
  friendDedupeKey,
  friendLabel,
  groupNewDatesByArtist,
  groupOverlapsByGig,
  tourDedupeKey,
  type FeedDate,
  type Overlap,
} from "../src/lib/alerts/phrasing";
import { pgTextArray, stripLikeWildcards } from "../src/lib/supabase/filters";
import { deriveStatus, effectiveEnd, nextStatus } from "../src/lib/wallet/lifecycle";
import {
  bandsintownArtistPath,
  cityCentroid,
  cleanText,
  countryName,
  dedupeNames,
  normalizeName,
  sameCity,
  toCountryCode,
} from "../src/lib/events/normalize";
import { anchorToLocalZone, endDisplay, fromLocalDT } from "../src/lib/dates";
import { mapBitEvent, sameLocalDate, type BitEvent } from "../src/lib/events/bandsintown/map";
import {
  mapTmEvent,
  mapTmPage,
  toMinorUnits,
  zonedWallClockToUtc,
  type TmPage,
} from "../src/lib/events/ticketmaster/map";
import { FlexibleDate } from "../src/lib/validation/dates";
import { fieldEquals, getPath, scoreSample, FIELD_MAP } from "./score";

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed += 1;
  } else {
    failures.push(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ── detectMimeType ─────────────────────────────────────────────────────── */

check(
  "png magic bytes",
  detectMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47])) === "image/png",
);
check(
  "jpeg magic bytes",
  detectMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])) === "image/jpeg",
);
check(
  "webp magic bytes (RIFF)",
  detectMimeType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00])) === "image/webp",
);
check(
  "pdf magic bytes (%PDF)",
  detectMimeType(new Uint8Array([0x25, 0x50, 0x44, 0x46])) === "application/pdf",
);
check(
  "unknown bytes fall back to jpeg",
  detectMimeType(new Uint8Array([0x00, 0x01, 0x02, 0x03])) === "image/jpeg",
);

/* ── PDF fail-closed (no API call, so runs offline) ─────────────────────── */

async function testPdfRejection() {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  await parseCaptureBytes(pdfBytes).then(
    () => check("pdf capture rejected", false, "resolved instead of throwing"),
    (err) => {
      check("pdf capture rejected", err instanceof ParseError);
      check(
        "pdf rejection carries a typed reason",
        err instanceof ParseError && err.reason === "schema_mismatch",
        err instanceof ParseError ? `reason=${err.reason}` : String(err),
      );
    },
  );
}

/* ── stripCodeFence ─────────────────────────────────────────────────────── */

check(
  "strips ```json fence",
  stripCodeFence('```json\n{"a":1}\n```') === '{"a":1}',
);
check(
  "strips bare ``` fence",
  stripCodeFence('```\n{"a":1}\n```') === '{"a":1}',
);
check(
  "leaves unfenced JSON alone",
  stripCodeFence('{"a":1}') === '{"a":1}',
);
check(
  "stripped fenced output parses as JSON",
  JSON.parse(stripCodeFence('```json\n{"kind":"ticket"}\n```')).kind === "ticket",
);

/* ── ParsedCaptureSchema (the model output contract) ────────────────────── */

const minimalValid = {
  kind: "ticket",
  title: "Gloss Hounds + Pylon",
  starts_at: "2026-07-04T20:00:00",
  ends_at: null,
  vendor: "tickethub",
  confidence: 0.92,
};
const okParse = ParsedCaptureSchema.safeParse(minimalValid);
check("minimal valid capture passes", okParse.success);
if (okParse.success) {
  check("barcode_present defaults false", okParse.data.barcode_present === false);
  check("details defaults to []", Array.isArray(okParse.data.details) && okParse.data.details.length === 0);
  check("pii_detected defaults false", okParse.data.pii_detected === false);
}
check(
  "empty title rejected",
  !ParsedCaptureSchema.safeParse({ ...minimalValid, title: "" }).success,
);
check(
  "confidence > 1 rejected",
  !ParsedCaptureSchema.safeParse({ ...minimalValid, confidence: 1.2 }).success,
);
check(
  "unknown kind rejected",
  !ParsedCaptureSchema.safeParse({ ...minimalValid, kind: "concert" }).success,
);
check(
  "iata must be 3 chars",
  !ParsedCaptureSchema.safeParse({
    ...minimalValid,
    kind: "flight",
    destination: { name: "Dublin", city: "Dublin", country: "IE", iata: "DUBL" },
  }).success,
);

/* ── fieldEquals normalisation ──────────────────────────────────────────── */

check(
  "dates equal at minute precision despite seconds/millis/Z",
  fieldEquals("2026-07-04T20:00:00", "2026-07-04T20:00:00.000Z"),
);
check(
  "dates differing by a minute are not equal",
  !fieldEquals("2026-07-04T20:00:00", "2026-07-04T20:01:00"),
);
check("strings compare case-insensitively", fieldEquals("O2 Forum", "o2 forum"));
check("strings compare accent-insensitively", fieldEquals("Café Öst", "cafe ost"));
check("whitespace is trimmed", fieldEquals("  London ", "London"));
check("different strings are unequal", !fieldEquals("London", "Leeds"));
check("non-strings compare via JSON", fieldEquals(45.1, 45.1) && !fieldEquals(45.1, 45.2));

/* ── getPath ────────────────────────────────────────────────────────────── */

const nested = { destination: { name: "O2 Forum", city: "London" } };
check("getPath resolves nested path", getPath(nested, "destination.city") === "London");
check("getPath returns undefined for missing path", getPath(nested, "origin.city") === undefined);

/* ── scoreSample end-to-end against a realistic sidecar ─────────────────── */

const parsed: ParsedCapture = {
  kind: "ticket",
  title: "Gloss Hounds + Pylon",
  starts_at: "2026-07-04T20:00:00",
  ends_at: null,
  destination: { name: "O2 Forum", city: "London", country: "GB" },
  vendor: "tickethub",
  price_total_cents: 4510,
  currency: "GBP",
  barcode_present: true,
  confidence: 0.9,
  details: ["VIP Package"],
  pii_detected: false,
};

// Sidecar in the corpus format: rich ticketing schema, incl. fields the parser
// deliberately does not extract.
const sidecar = {
  title: "Gloss Hounds + Pylon",
  artist: "Gloss Hounds",
  venue: "O2 Forum",
  city: "London",
  starts_at: "2026-07-04T20:00:00",
  doors_at: "2026-07-04T18:30:00",
  ticket_type: "VIP Package",
  order_ref: "2XSW63HY",
  barcode: "CSK4HGA9TMYLK2",
  price_total: 45.1,
  currency: "GBP",
};

const s = scoreSample(parsed, sidecar);
check(
  "perfect parse scores 100% on scored fields",
  s.fieldsChecked > 0 && s.fieldsCorrect === s.fieldsChecked,
  `got ${s.fieldsCorrect}/${s.fieldsChecked}, mismatches: ${JSON.stringify(s.mismatches)}`,
);
check(
  "designed-out fields are unscored, not failures",
  ["artist", "doors_at", "ticket_type", "order_ref"].every((f) =>
    s.unscored.includes(f),
  ),
  `unscored=${JSON.stringify(s.unscored)}`,
);
check(
  "price and currency are now scored, not unscored",
  !s.unscored.includes("price_total") && !s.unscored.includes("currency"),
  `unscored=${JSON.stringify(s.unscored)}`,
);
check(
  "scored set is title, starts_at, venue, city, barcode, price, currency",
  s.fieldsChecked === 7,
  `fieldsChecked=${s.fieldsChecked}`,
);
// Price crosses a unit boundary: sidecar 45.1 (major) vs parse 4510 (minor).
check(
  "price compared across major/minor units",
  scoreSample({ ...parsed, price_total_cents: 4510 }, { price_total: 45.1 })
    .fieldsCorrect === 1,
);
check(
  "wrong price is a mismatch, not a pass",
  scoreSample({ ...parsed, price_total_cents: 4500 }, { price_total: 45.1 })
    .mismatches.some((m) => m.field === "price_total"),
);
check(
  "missing price is a mismatch when the sidecar has one",
  scoreSample({ ...parsed, price_total_cents: null }, { price_total: 45.1 })
    .mismatches.some((m) => m.field === "price_total"),
);

// Wrong city + missing barcode must surface as mismatches.
const worse = scoreSample(
  { ...parsed, destination: { name: "O2 Forum", city: "Leeds", country: "GB" }, barcode_present: false },
  sidecar,
);
check(
  "wrong city and absent barcode are counted as mismatches",
  worse.mismatches.some((m) => m.field === "city") &&
    worse.mismatches.some((m) => m.field === "barcode"),
  JSON.stringify(worse.mismatches),
);
check(
  "mismatches reduce the correct count",
  worse.fieldsCorrect === worse.fieldsChecked - 2,
  `${worse.fieldsCorrect}/${worse.fieldsChecked}`,
);

// Null sidecar values are skipped entirely.
const skipped = scoreSample(parsed, { title: "Gloss Hounds + Pylon", venue: null });
check("null sidecar values are skipped", skipped.fieldsChecked === 1);

// Every FIELD_MAP dot-path target must exist in the ParsedCapture shape —
// guards against the scorer silently drifting from the schema.
const pathTargets = Object.values(FIELD_MAP).filter(
  (v): v is string =>
    typeof v === "string" && !v.startsWith("__"), // __barcode__/__price__ are handled specially
);
check(
  "every FIELD_MAP path resolves against a real parse",
  pathTargets.every((p) => getPath(parsed, p) !== undefined),
  `paths=${JSON.stringify(pathTargets)}`,
);

/* ── date rules ─────────────────────────────────────────────────────────── */
//
// Every assertion here is timezone-independent on purpose: these ran green in
// UTC while being an hour wrong for every British user in summer, which is the
// whole reason they now live outside the components.

// fromLocalDT must treat its input as LOCAL wall clock. The old code appended
// "Z", which is only correct when the runner happens to sit in UTC — so assert
// the property instead: the instant it produces, read back in local time, is
// the wall clock we started with.
{
  const wall = "2026-07-14T19:30";
  const iso = fromLocalDT(wall);
  const back = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const roundTrip = `${back.getFullYear()}-${pad(back.getMonth() + 1)}-${pad(
    back.getDate(),
  )}T${pad(back.getHours())}:${pad(back.getMinutes())}`;
  check("fromLocalDT round-trips through local wall clock", roundTrip === wall, roundTrip);
  check("fromLocalDT emits a UTC instant", iso.endsWith("Z"), iso);
}

check("fromLocalDT passes empty through", fromLocalDT("") === "");
check("fromLocalDT rejects nonsense", fromLocalDT("not a date") === "");

// anchorToLocalZone must leave anything that already states its offset alone —
// re-anchoring an absolute instant would move it.
check(
  "anchorToLocalZone leaves a Z-suffixed instant untouched",
  anchorToLocalZone("2026-07-14T18:30:00.000Z") === "2026-07-14T18:30:00.000Z",
);
check(
  "anchorToLocalZone leaves a numeric offset untouched",
  anchorToLocalZone("2026-07-14T19:30:00+01:00") === "2026-07-14T19:30:00+01:00",
);
check("anchorToLocalZone maps null to empty", anchorToLocalZone(null) === "");
check(
  "anchorToLocalZone anchors an offsetless parse to an instant",
  anchorToLocalZone("2026-07-14T19:30:00").endsWith("Z"),
);
{
  // Same wall clock in, same instant out, whichever path produced it.
  const viaParser = anchorToLocalZone("2026-07-14T19:30:00");
  const viaPicker = fromLocalDT("2026-07-14T19:30");
  check(
    "parser and picker agree on the same wall clock",
    viaParser === viaPicker,
    `${viaParser} vs ${viaPicker}`,
  );
}
check(
  "anchorToLocalZone returns unparseable input unchanged",
  anchorToLocalZone("sometime next year") === "sometime next year",
);

// endDisplay: a placeholder end equal to the start is not a range.
check(
  "endDisplay hides an end equal to the start",
  endDisplay("2026-07-14T19:30:00Z", "2026-07-14T19:30:00Z").show === false,
);
check(
  "endDisplay hides an end before the start",
  endDisplay("2026-07-14T19:30:00Z", "2026-07-14T18:00:00Z").show === false,
);
check("endDisplay hides a missing end", endDisplay("2026-07-14T19:30:00Z", null).show === false);
check("endDisplay hides a missing start", endDisplay(null, "2026-07-14T19:30:00Z").show === false);
check(
  "endDisplay hides an unparseable end",
  endDisplay("2026-07-14T19:30:00Z", "later on").show === false,
);
{
  // Compare against local calendar days, since that is what the rule uses.
  const start = new Date("2026-07-14T12:00:00Z");
  const laterSameDay = new Date(start.getTime() + 3 * 3600_000);
  const nextDay = new Date(start.getTime() + 36 * 3600_000);
  const a = endDisplay(start.toISOString(), laterSameDay.toISOString());
  const b = endDisplay(start.toISOString(), nextDay.toISOString());
  check(
    "endDisplay shows a same-day end as time only",
    a.show === true && a.sameDay === (laterSameDay.toDateString() === start.toDateString()),
  );
  check("endDisplay shows a multi-day end", b.show === true && b.sameDay === false);
}

/* ── FlexibleDate ───────────────────────────────────────────────────────── */
//
// The confirm path and the manual-add path share this schema. When they had
// one each, a value could be accepted by one and rejected by the other.

check("FlexibleDate accepts offsetless parser output", FlexibleDate.safeParse("2026-08-31T19:00:00").success);
check("FlexibleDate accepts datetime-local", FlexibleDate.safeParse("2026-08-31T19:00").success);
check("FlexibleDate accepts a full instant", FlexibleDate.safeParse("2026-08-31T18:00:00.000Z").success);
check("FlexibleDate accepts null", FlexibleDate.safeParse(null).success);
check("FlexibleDate accepts empty (the cleared field)", FlexibleDate.safeParse("").success);
check("FlexibleDate rejects prose", !FlexibleDate.safeParse("next Tuesday-ish").success);

/* ── alert grouping and wording ─────────────────────────────────────────── */

const overlap = (
  gig: string,
  username: string,
  display: string | null = null,
): Overlap => ({
  wallet_item_id: gig,
  title: `Gig ${gig}`,
  starts_at: "2026-09-14T19:30:00.000Z",
  friend_username: username,
  friend_display_name: display,
});

{
  // who_else_going returns one row per (gig, friend). Three friends at one gig
  // must be one alert, not three.
  const grouped = groupOverlapsByGig([
    overlap("a", "ana"),
    overlap("b", "bo"),
    overlap("a", "cal"),
  ]);
  check("groupOverlapsByGig collapses per gig", grouped.size === 2, `${grouped.size}`);
  check("groupOverlapsByGig keeps every friend", grouped.get("a")?.length === 2);
  check("groupOverlapsByGig handles no overlaps", groupOverlapsByGig([]).size === 0);
}

check("friendLabel prefers a display name", friendLabel(overlap("a", "ana", "Ana")) === "Ana");
check("friendLabel falls back to the handle", friendLabel(overlap("a", "ana")) === "@ana");
check(
  "friendLabel treats a blank display name as absent",
  friendLabel(overlap("a", "ana", "   ")) === "@ana",
);

check("describeFriends: one", describeFriends(["Ana"]) === "Ana is going too.");
check("describeFriends: two", describeFriends(["Ana", "Bo"]) === "Ana and Bo are going too.");
check(
  "describeFriends: three says '1 other', not '1 others'",
  describeFriends(["Ana", "Bo", "Cal"]) === "Ana, Bo and 1 other are going too.",
  describeFriends(["Ana", "Bo", "Cal"]),
);
check(
  "describeFriends: four pluralises",
  describeFriends(["Ana", "Bo", "Cal", "Dee"]) === "Ana, Bo and 2 others are going too.",
);
check("describeFriends: none is empty", describeFriends([]) === "");

// The dedupe key is what stops a re-scan duplicating alerts and what lets a
// new friend raise a fresh one. Both halves matter.
check(
  "friendDedupeKey is stable for the same group",
  friendDedupeKey("gig-1", 2) === friendDedupeKey("gig-1", 2),
);
check(
  "friendDedupeKey changes when another friend joins",
  friendDedupeKey("gig-1", 2) !== friendDedupeKey("gig-1", 3),
);
check(
  "friendDedupeKey separates gigs",
  friendDedupeKey("gig-1", 2) !== friendDedupeKey("gig-2", 2),
);

/* ── tour_announce grouping ─────────────────────────────────────────────── */
//
// The first production sync stamped 4,836 events with one created_at. The
// rule under test is what stops a follower being told an artist's whole
// catalogue is "new", and what turns a twelve-date announcement into one
// alert instead of twelve.

const feedDate = (over: Partial<FeedDate> & { id: string }): FeedDate => ({
  title: `${over.id} live`,
  artist_names: ["Fontaines D.C."],
  venue_name: "Barrowland",
  venue_city: "Glasgow",
  starts_at: "2026-11-20T19:30:00+00:00",
  created_at: "2026-09-03T15:17:35+00:00", // the backfill instant
  external_url: null,
  ...over,
});

const followedBefore = followedAtIndex([
  { kind: "artist", name: "fontaines d.c.", created_at: "2026-09-01T10:00:00+00:00" },
  { kind: "venue", name: "Barrowland", created_at: "2026-09-01T10:00:00+00:00" },
]);
const followedAfter = followedAtIndex([
  { kind: "artist", name: "Fontaines D.C.", created_at: "2026-09-04T10:00:00+00:00" },
]);

check(
  "followedAtIndex lower-cases and keeps the earliest",
  followedAtIndex([
    { kind: "artist", name: "IDLES", created_at: "2026-09-02T00:00:00+00:00" },
    { kind: "artist", name: "idles ", created_at: "2026-09-01T00:00:00+00:00" },
  ]).get("idles") === "2026-09-01T00:00:00+00:00",
);
check("followedAtIndex ignores venues", !followedBefore.has("barrowland"));

{
  const backfill = [feedDate({ id: "a" }), feedDate({ id: "b" }), feedDate({ id: "c" })];
  check(
    "backfill before the follow is not news",
    groupNewDatesByArtist(backfill, followedAfter).length === 0,
  );
  const groups = groupNewDatesByArtist(backfill, followedBefore);
  check("dates after the follow group into one alert per artist", groups.length === 1);
  check("the group holds every date", groups[0]?.dates.length === 3);
  check("group artist is spelled as on the event", groups[0]?.artist === "Fontaines D.C.");
}

{
  // A twelve-date tour on one day, then one extra date a week later.
  const tour = Array.from({ length: 12 }, (_, i) =>
    feedDate({
      id: `t${i}`,
      starts_at: `2026-12-${String(i + 1).padStart(2, "0")}T19:30:00+00:00`,
      created_at: "2026-09-10T09:00:00+00:00",
    }),
  );
  const [g] = groupNewDatesByArtist(tour.reverse(), followedBefore);
  check("twelve dates sort soonest first", g?.dates[0]?.id === "t0");
  const key1 = tourDedupeKey(g.artistKey, g.newestId);
  check(
    "dedupe key is stable across a rescan",
    key1 === tourDedupeKey(g.artistKey, groupNewDatesByArtist(tour, followedBefore)[0].newestId),
  );
  const extra = feedDate({
    id: "t99",
    starts_at: "2026-12-20T19:30:00+00:00",
    created_at: "2026-09-17T09:00:00+00:00",
  });
  const [g2] = groupNewDatesByArtist([...tour, extra], followedBefore);
  check("a later date changes the key", tourDedupeKey(g2.artistKey, g2.newestId) !== key1);
  check("multi-date wording", describeNewDates(g).title === "Fontaines D.C.: 12 new dates");
  check("multi-date body names the first venue", describeNewDates(g).body === "First up: Barrowland, Glasgow.");
  check(
    "single-date wording keeps the event title",
    describeNewDates(groupNewDatesByArtist([extra], followedBefore)[0]).title === "t99 live",
  );
}

check(
  "a shared bill lands in both artists' groups",
  groupNewDatesByArtist(
    [feedDate({ id: "x", artist_names: ["Fontaines D.C.", "IDLES"], created_at: "2026-09-10T00:00:00+00:00" })],
    followedAtIndex([
      { kind: "artist", name: "Fontaines D.C.", created_at: "2026-09-01T00:00:00+00:00" },
      { kind: "artist", name: "IDLES", created_at: "2026-09-01T00:00:00+00:00" },
    ]),
  ).length === 2,
);
check(
  "undated rows are skipped",
  groupNewDatesByArtist([feedDate({ id: "u", starts_at: null, created_at: "2026-09-10T00:00:00+00:00" })], followedBefore).length === 0,
);

/* ── PostgREST array literal ────────────────────────────────────────────── */
//
// postgrest-js sends `{a,b}` unquoted; Postgres rejects `{"Weird Al" Yankovic}`
// with 22P02 and splits "Earth, Wind & Fire" in two. Verified against the
// production API before the helper was written.

check("pgTextArray quotes plain names", pgTextArray(["Coldplay", "IDLES"]) === '{"Coldplay","IDLES"}');
check("pgTextArray keeps a comma inside one element", pgTextArray(["Earth, Wind & Fire"]) === '{"Earth, Wind & Fire"}');
check(
  "pgTextArray escapes an inner double quote",
  pgTextArray(['"Weird Al" Yankovic']) === '{"\\"Weird Al\\" Yankovic"}',
);
check("pgTextArray escapes a backslash", pgTextArray(["a\\b"]) === '{"a\\\\b"}');
check("pgTextArray empty list is an empty literal", pgTextArray([]) === "{}");

// .ilike sends its value as the PATTERN. Backslash-escaping is a no-op --
// PostgREST eats the backslash -- so wildcards are removed instead.
check("stripLikeWildcards removes a bare percent", stripLikeWildcards("%") === "");
check("stripLikeWildcards removes a trailing percent", stripLikeWildcards("L%") === "L");
check("stripLikeWildcards removes the underscore wildcard", stripLikeWildcards("L_eds") === "Leds");
check("stripLikeWildcards removes a backslash", stripLikeWildcards("a\\b") === "ab");
check("stripLikeWildcards leaves an ordinary city alone", stripLikeWildcards("Milton Keynes") === "Milton Keynes");

// .ilike sends its value as the PATTERN: "?city=%" matched every city.

/* ── wallet lifecycle ───────────────────────────────────────────────────── */
//
// One rule for "what status should this item have right now", shared by
// every insert path and the hourly reconciler that finally makes statuses
// move with time.

{
  const H = 3600_000;
  const now = Date.parse("2026-09-05T18:00:00Z");
  const at = (offsetH: number) => new Date(now + offsetH * H).toISOString();
  check("lifecycle: no date is wishlist", deriveStatus(null, null, now) === "wishlist");
  check("lifecycle: next week is going", deriveStatus(at(7 * 24), null, now) === "going");
  check("lifecycle: doors in 2h is tonight", deriveStatus(at(2), null, now) === "tonight");
  check("lifecycle: 12h exactly is still going", deriveStatus(at(12), null, now) === "going");
  check("lifecycle: started 1h ago, no end, is tonight (live)", deriveStatus(at(-1), null, now) === "tonight");
  check("lifecycle: started 5h ago, no end, is attended", deriveStatus(at(-5), null, now) === "attended");
  check("lifecycle: explicit end in the future keeps it live", deriveStatus(at(-5), at(1), now) === "tonight");
  check("lifecycle: explicit end in the past is attended", deriveStatus(at(-3), at(-1), now) === "attended");
  check("lifecycle: end before start falls back to the default duration", effectiveEnd(at(0), at(-2)) === now + 4 * H);

  check("reconcile: going -> tonight", nextStatus("going", at(2), null, now) === "tonight");
  check("reconcile: going -> attended", nextStatus("going", at(-6), null, now) === "attended");
  check("reconcile: tonight -> attended", nextStatus("tonight", at(-6), null, now) === "attended");
  check("reconcile: tonight never goes back to going", nextStatus("tonight", at(48), null, now) === null);
  check("reconcile: unchanged is null", nextStatus("going", at(48), null, now) === null);
  check("reconcile: wishlist never moves", nextStatus("wishlist", at(-6), null, now) === null);
  check("reconcile: attended never moves", nextStatus("attended", at(48), null, now) === null);
  check("reconcile: archived never moves", nextStatus("archived", at(-6), null, now) === null);
  check("reconcile: undated going stays", nextStatus("going", null, null, now) === null);
}

/* ── feed normalisers ───────────────────────────────────────────────────── */

check("normalizeName collapses punctuation and case", normalizeName("Fontaines D.C.") === normalizeName("fontaines dc"));
check("normalizeName keeps distinct acts apart", normalizeName("IDLES") !== normalizeName("Idlewild"));
check("normalizeName strips accents", normalizeName("Sigur Rós") === "sigurros");
check("sameCity: Newcastle upon Tyne is Newcastle", sameCity("Newcastle upon Tyne", "Newcastle"));
check("sameCity: two cities differ", !sameCity("Leeds", "London"));
check("sameCity: unknown never matches", !sameCity(null, "London"));
check("cityCentroid: sweep city", cityCentroid("Manchester")?.lat === 53.4808);
check("cityCentroid: loose prefix match", cityCentroid("Newcastle upon Tyne")?.lng === -1.6178);
check("cityCentroid: unknown town is null, never the venue point", cityCentroid("Monivea") === null);
check("cleanText trims provider padding", cleanText(" London ") === "London");
check("cleanText collapses inner runs", cleanText("Newcastle  upon   Tyne") === "Newcastle upon Tyne");
check("cleanText maps blank to null", cleanText("   ") === null);
check("cleanText passes a clean name through", cleanText("Belfast") === "Belfast");
check("toCountryCode: Bandsintown full name", toCountryCode("United Kingdom") === "GB");
check("toCountryCode: Ticketmaster ISO-2 passes through", toCountryCode("gb") === "GB");
check("toCountryCode: Ireland", toCountryCode("Ireland") === "IE");
check("countryName renders a code", countryName("GB") === "United Kingdom");
check("countryName leaves non-codes alone", countryName("Narnia") === "Narnia");
check("bandsintownArtistPath double-encodes the slash", bandsintownArtistPath("AC/DC") === "AC%252FDC");
check("bandsintownArtistPath leaves plain names alone", bandsintownArtistPath("IDLES") === "IDLES");
// The 120-char zod bound only runs in the server action; the anon key ships
// in the client bundle, so a row can be written straight to PostgREST.
check(
  "dedupeNames drops a name past the 120-char bound",
  dedupeNames(["IDLES", "x".repeat(121)]).length === 1,
);
check(
  "dedupeNames keeps a name exactly at the bound",
  dedupeNames(["y".repeat(120)]).length === 1,
);
check(
  "dedupeNames keeps one spelling per act",
  JSON.stringify(dedupeNames(["IDLES", " idles", "Fontaines D.C.", "fontaines dc", ""])) ===
    JSON.stringify(["IDLES", "Fontaines D.C."]),
);

/* ── Ticketmaster feed mapper ───────────────────────────────────────────── */
//
// Fixture note: hand-built to the Discovery v2 documented schema (a real
// recorded response needs an API key this environment does not hold). When a
// live capture lands, replace the file — the tests only get stricter.
{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fixture = require("./fixtures/ticketmaster-sample.json") as TmPage;
  const events = mapTmPage(fixture);

  check("tm: canceled events are dropped", events.length === 3, `${events.length}`);
  check(
    "tm: the British spelling is dropped too",
    mapTmEvent({ id: "x", name: "X", dates: { status: { code: "cancelled" } } }) === null,
  );
  check(
    "tm: postponed is kept and tagged",
    mapTmEvent({
      id: "y",
      name: "Y",
      dates: { status: { code: "postponed" }, start: { dateTime: "2026-11-20T19:30:00Z" } },
    })?.tags.includes("postponed") === true,
  );
  const gig = events.find((e) => e.externalId === "tm-evt-1");
  check("tm: title and headliner", gig?.title === "Fontaines D.C." && gig?.headliner === "Fontaines D.C.");
  check("tm: support act captured", gig?.artistNames.length === 2);
  check("tm: starts_at passes through as UTC", gig?.startsAt === "2026-11-14T19:30:00Z");
  check("tm: on-sale date captured", gig?.onSaleAt === "2026-09-05T09:00:00Z");
  check("tm: prices to minor units", gig?.minPriceCents === 4550 && gig?.maxPriceCents === 6500);
  check("tm: largest 16:9 image wins", gig?.imageUrl === "https://img.tm/wide-big.jpg");
  check("tm: venue mapped with coords", gig?.venue?.name === "O2 Apollo Manchester" && gig?.venue?.lat === 53.4646);
  check("tm: one ticket link", gig?.ticketLinks.length === 1 && gig?.ticketLinks[0].provider === "ticketmaster");
  check("tm: genre tags lowercased", !!gig && gig.tags.includes("rock") && gig.tags.includes("indie rock"));

  const fest = events.find((e) => e.externalId === "tm-evt-3");
  check("tm: festival categorised", fest?.category === "festival");
  check("tm: TBA time tagged", !!fest && fest.tags.includes("time_tba"));
  // 2027-07-10 in Dublin is IST (UTC+1): 19:00 local = 18:00Z.
  check("tm: TBA date anchored in venue zone", fest?.startsAt === "2027-07-10T18:00:00.000Z", fest?.startsAt ?? "null");
  check("tm: no priceRanges -> null prices", fest?.minPriceCents === null && fest?.maxPriceCents === null);
  check("tm: no url -> no ticket links", events.find((e) => e.externalId === "tm-evt-4")?.ticketLinks.length === 0);
  check("tm: comedy categorised", events.find((e) => e.externalId === "tm-evt-4")?.category === "comedy");
}

// The zone helper is the same trap the confirm card fell into once — assert
// the property in both halves of the year, in a non-UTC runner too.
check("tz: winter London wall clock", zonedWallClockToUtc("2026-01-15", "19:00", "Europe/London") === "2026-01-15T19:00:00.000Z");
check("tz: summer London wall clock", zonedWallClockToUtc("2026-07-15", "19:00", "Europe/London") === "2026-07-15T18:00:00.000Z");
check("tz: unknown zone -> null", zonedWallClockToUtc("2026-07-15", "19:00", "Not/AZone") === null);
check("units: 45.5 -> 4550", toMinorUnits(45.5) === 4550);
check("units: undefined -> null", toMinorUnits(undefined) === null);

/* ── Bandsintown mapper + cross-provider dedupe ─────────────────────────── */
{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fixture = require("./fixtures/bandsintown-sample.json") as BitEvent[];
  const events = fixture
    .map((e) => mapBitEvent("Just Mustard", e))
    .filter((e): e is NonNullable<typeof e> => e !== null);

  check("bit: undated event dropped", events.length === 2, `${events.length}`);
  const gig = events.find((e) => e.externalId === "bit-1");
  // 2026-11-20 in London is GMT: 20:00 local = 20:00Z.
  check("bit: local wall clock anchored to venue zone (winter)", gig?.startsAt === "2026-11-20T20:00:00.000Z", gig?.startsAt ?? "null");
  check("bit: empty title falls back to artist", gig?.title === "Just Mustard live");
  check(
    "bit: headliner is the API's spelling, not the follower's",
    mapBitEvent("just mustard", fixture[0])?.headliner === "Just Mustard",
  );
  check(
    "bit: country stored as ISO-2",
    mapBitEvent("Just Mustard", { ...fixture[0], venue: { ...fixture[0].venue, country: "United Kingdom" } })?.venue?.country === "GB",
  );
  check("bit: ticket offer becomes a link", gig?.ticketLinks[0]?.provider === "bandsintown");

  const dublin = events.find((e) => e.externalId === "bit-2");
  // 2027-06-05 in Dublin is IST (UTC+1): 19:00 local = 18:00Z.
  check("bit: summer Dublin wall clock", dublin?.startsAt === "2027-06-05T18:00:00.000Z", dublin?.startsAt ?? "null");
  check("bit: on-sale converted in venue zone", dublin?.onSaleAt === "2026-09-12T09:00:00.000Z", dublin?.onSaleAt ?? "null");
  check("bit: sold_out carried", dublin?.isSoldOut === true);
}

// The dedupe predicate: a 20:00 London gig and TM's 19:30 listing are the
// same night; a 00:30 club night is NOT the previous night's gig.
check("dedupe: same London evening matches", sameLocalDate("2026-11-20T19:30:00Z", "2026-11-20T20:00:00.000Z", "Europe/London"));
check(
  "dedupe: past-midnight local date differs",
  !sameLocalDate("2026-07-10T22:00:00Z", "2026-07-10T23:30:00Z", "Europe/London"),
);
check("dedupe: null zone falls back sanely", sameLocalDate("2026-11-20T10:00:00Z", "2026-11-20T22:00:00Z", null));

/* ── report ─────────────────────────────────────────────────────────────── */

testPdfRejection().then(() => {
  const total = passed + failures.length;
  console.log(`\ncapture logic tests: ${passed}/${total} passed`);
  for (const f of failures) console.error(f);
  if (failures.length > 0) process.exit(1);
});
