# Events feed — implementation plan

**Status:** planned 2026-09-02 (Fable 5.1). To be built by a smaller model,
phase by phase, in order. Each phase is independently shippable and ends with
a commit that passes CI.

**Decisions already made (do not reopen):**

| Decision | Choice |
| --- | --- |
| Providers | Ticketmaster Discovery (primary: discovery + on-sale dates + prices) and Bandsintown (followed artists' tour announcements) |
| Geography | UK + Ireland city sweep, nightly |
| Launch | When real rows exist, un-hide **Events only** — Marketplace and Merch stay hidden |
| Scheduling | Vercel Cron (`vercel.json`), daily. Plus a manual GitHub Actions `workflow_dispatch` as backup. The endpoint is idempotent, so double-firing is harmless |
| Writes | All feed writes use `createServiceClient()`. `venues` is service-role-only (see `scripts/check-service-role-writes.mjs`); `events` synced rows must default to `status='approved'` (migration 0011) |

**Why this shape:** the schema already anticipates a feed. `events` has
`source`/`external_id` with a unique index (`events_source_external_idx`), a
GiST location index, `event_ticket_links` with a `provider` column, and
moderation that trusts synced sources. The `alerts` table has `on_sale` and
`tour_announce` kinds that have never fired because nothing produced the data.
`follows` (kind: artist | promoter | venue) and an artist page with follow
state already exist. This plan connects those pieces; it invents nothing new
that the schema does not already expect.

**The strategic point** (for whoever writes copy later): Ticketmaster covers
the big rooms. The independent venues Mark wants to court are exactly the
ones *not* on it. The feed gives testers a baseline "what's on"; the existing
promoter-submit flow is how an independent venue gets its listings in front of
the same audience. Both feeds land in the same table and the same page.

---

## Repo conventions the builder must follow

These are hard-won in this codebase. Read `CLAUDE.md` first.

1. **Never write to `venues` with the session client.** Use
   `createServiceClient()`. `pnpm check:rls` fails the build otherwise.
2. **Every `update`/`delete` gets `.select()` and a row-count check.** RLS
   denies silently; no rows back means it did not happen.
3. **Times of day render only in client components** (`LocalDateTime` in
   `src/components/local-datetime.tsx`). Server components format in UTC.
   Store all timestamps as UTC ISO strings.
4. **Auth in server components:** `getSessionUser()` from
   `@/lib/supabase/server`, not `supabase.auth.getUser()`.
5. **Server-action forms** use `PendingButton` (`src/components/pending-button.tsx`).
6. **Pure logic gets tests** in `eval/logic.test.ts` (node, no framework —
   see the `check()` helper). Put pure functions in files with no
   `server-only` import so the test runner can import them.
7. **Do not apply migrations.** Write them to `supabase/migrations/`, update
   `supabase/pending/README.md`, and stop. Mark says when they are applied.
8. **Secrets:** server-only env vars go through `serverEnv` in `src/lib/env.ts`
   (see `required()`/`clean()` there). In Vercel they must be set for
   **Production + Preview only** — adding Development strips the Sensitive
   flag. Never put a key in a `NEXT_PUBLIC_*` var.
9. **Verify before every commit:**
   `pnpm typecheck && pnpm lint && pnpm check:rls && pnpm test:logic && pnpm build`.
   Lint has 48 pre-existing warnings; do not add to them.
10. **Commit messages** explain *why*, in prose, like the existing history.
11. **Parity rule:** everything here is a web deploy, so it reaches web, iOS
    and Android together. No native work is involved.

---

## Phase 0 — Keys and environment (Mark, ~15 min)

Nothing in later phases can be tested end-to-end without these.

- [ ] Create a free account at <https://developer.ticketmaster.com>, create an
      app, copy the **Consumer Key**. Free tier: 5,000 calls/day, 5/sec.
- [ ] Bandsintown: <https://artists.bandsintown.com/support/public-api> —
      the `app_id` is a string you choose (use `gigtrotter`); no approval
      needed for the public artist-events endpoint.
- [ ] Generate a cron secret: `openssl rand -hex 32`.
- [ ] Add to Vercel (Production + Preview, Sensitive): `TICKETMASTER_API_KEY`,
      `BANDSINTOWN_APP_ID`, `CRON_SECRET`. Add the same three to `.env.local`.
- [ ] Redeploy after saving (Vercel env changes need a deploy to take effect).

The builder can do Phases 1–2 before these exist (pure code + tests with
recorded fixtures). Phase 3 onward needs the keys locally.

---

## Phase 1 — Migration `0021_events_feed.sql`

Additive only. Purpose: the columns the feed needs that the schema lacks, plus
an observability table so a silent cron failure is visible.

```sql
-- On-sale time from the provider (Ticketmaster sales.public.startDateTime).
-- Powers the on_sale alert kind, which has existed since 0004 and never fired.
alter table public.events add column if not exists on_sale_at timestamptz;

-- When the feed last saw this row. Lets a later cleanup expire rows the
-- provider no longer returns (cancelled shows) without deleting promoter
-- submissions, which have source = 'manual'.
alter table public.events add column if not exists last_seen_at timestamptz;

-- Provider timezone (IANA), so "same local date" dedupe between providers is
-- done in the venue's zone, not UTC.
alter table public.events add column if not exists timezone text;

create index if not exists events_on_sale_idx
  on public.events (on_sale_at) where on_sale_at is not null;
create index if not exists events_source_last_seen_idx
  on public.events (source, last_seen_at);

-- One row per sync run. The cron has no UI; this is how anyone knows it ran.
create table if not exists public.feed_sync_runs (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,               -- 'ticketmaster' | 'bandsintown'
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  api_calls    int not null default 0,
  upserted     int not null default 0,
  skipped      int not null default 0,
  errors       int not null default 0,
  notes        text                          -- first error message, if any
);
alter table public.feed_sync_runs enable row level security;
-- No policies: service role only. Admin page reads it via the service client.
```

Also add `on_sale_at`, `last_seen_at`, `timezone` to `EventRow` in
`src/lib/supabase/types.ts` (check whether `events` is typed there at all; if
not, add a minimal `EventRow` with the columns the app selects — the `any`
casts in `src/app/app/events/page.tsx` are technical debt, not a pattern).

Update `supabase/pending/README.md` with a row for 0021. **Do not apply.**

**Acceptance:** typecheck passes; README row present.

---

## Phase 2 — Ticketmaster adapter (pure, tested)

Files:

```
src/lib/events/feed-types.ts       // FeedEvent, FeedTicketLink (normalised shape)
src/lib/events/ticketmaster/map.ts // PURE: TM JSON -> FeedEvent[]   (no server-only)
src/lib/events/ticketmaster/fetch.ts // network: paged fetch with rate limit (server-only)
src/lib/events/cities.ts           // UK+IE sweep list
eval/fixtures/ticketmaster-sample.json  // one real response page, secrets stripped
```

**Normalised shape** (the single contract every provider maps to):

```ts
export type FeedEvent = {
  source: "ticketmaster" | "bandsintown";
  externalId: string;
  title: string;
  headliner: string | null;
  artistNames: string[];
  category: "concert" | "festival" | "club_night" | "theatre" | "comedy" | "sport" | "other";
  venue: { name: string; city: string | null; country: string | null; lat: number | null; lng: number | null } | null;
  startsAt: string | null;   // UTC ISO
  endsAt: string | null;
  doorsAt: string | null;
  timezone: string | null;   // IANA
  onSaleAt: string | null;   // UTC ISO
  imageUrl: string | null;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  currency: string;          // ISO 4217, default "GBP"
  isSoldOut: boolean;
  externalUrl: string | null;
  ticketLinks: { provider: string; label: string; url: string; minPriceCents: number | null; maxPriceCents: number | null; currency: string; isSoldOut: boolean }[];
  tags: string[];
};
```

**Ticketmaster mapping rules** (Discovery API v2, `GET /discovery/v2/events.json`):

- `externalId` = `event.id`.
- `startsAt` = `dates.start.dateTime` (already UTC ISO) — if only
  `localDate` exists (`dateTBA`/`timeTBA`), set `startsAt` to
  `localDate` at 19:00 in `dates.timezone`, and tag `time_tba`.
- `timezone` = `dates.timezone`.
- `onSaleAt` = `sales.public.startDateTime` (UTC ISO) or null.
- `isSoldOut` = `dates.status.code === "offsale"` is NOT sold out — it means
  sales ended. Use `dates.status.code === "cancelled"` → skip the event
  entirely; sold-out is not reliably exposed, default false.
- `venue` from `_embedded.venues[0]`: `name`, `city.name`,
  `country.countryCode`, `location.latitude/longitude` (strings → numbers).
- `artistNames` from `_embedded.attractions[].name`; `headliner` = first.
- `category`: `classifications[0].segment.name === "Music"` → if
  `genre.name` contains "Festival" → `festival`, else `concert`.
  Segment "Arts & Theatre" → `theatre`; "Comedy" genre → `comedy`;
  "Sports" → `sport`; else `other`.
- Prices from `priceRanges[0]` (`min`/`max` in major units → ×100, round).
  `currency` from the same object.
- `imageUrl`: pick the `images[]` entry with `ratio === "16_9"` and the
  largest `width`; fall back to the first image.
- `externalUrl` = `event.url`. One ticket link: provider `ticketmaster`,
  label `Buy on Ticketmaster`, same URL and prices.
- `tags`: genre and subGenre names, lowercased, deduped.

**Fetch rules** (`fetch.ts`):

- Query per city: `latlong=<lat>,<lng>&radius=40&unit=km&classificationName=Music&startDateTime=<now UTC, no millis, 'Z'>&endDateTime=<now+90d>&size=200&sort=date,asc&apikey=...`
  plus `countryCode=GB` or `IE` per city.
- Follow `page.totalPages` up to **3 pages per city**.
- Sleep **250 ms** between calls (5/sec limit). Hard cap **400 calls per
  run**; stop cleanly when hit and record it in `feed_sync_runs.notes`.
- Any non-2xx: record, skip that city, continue. Never throw out of the run.
- Timeout each request at 15 s.

**Cities** (`cities.ts`): London, Manchester, Birmingham, Leeds, Glasgow,
Edinburgh, Liverpool, Bristol, Newcastle, Sheffield, Nottingham, Cardiff,
Belfast, Brighton, Leicester, Southampton, Portsmouth, Oxford, Cambridge,
Norwich, Hull, Aberdeen, Dundee, Inverness, Swansea, Exeter, Plymouth, Bath,
York, Coventry, Derby, Stoke, Middlesbrough, Sunderland, Wolverhampton,
Reading, Milton Keynes, Bournemouth, Dublin, Cork, Galway, Limerick, Derry.
Each with lat/lng and country. ~43 cities × ≤3 pages ≈ 130 calls, well under cap.

**Tests** (add to `eval/logic.test.ts`, importing from `map.ts` only):
- fixture maps to the expected count of events, cancelled ones excluded
- a `dateTBA` event gets 19:00 local and the `time_tba` tag
- price 45.5 → 4550; missing priceRanges → nulls
- 16:9 largest image chosen
- `onSaleAt` parsed; missing → null
- Aim for ≥10 assertions. The fixture must be a real response with the
  `apikey` and any personal data stripped.

**Acceptance:** tests green; `map.ts` has no network or server-only import.

---

## Phase 3 — Upsert + cron endpoint + schedule

Files:

```
src/lib/events/upsert.ts            // FeedEvent[] -> DB, service client
src/lib/events/sync-ticketmaster.ts // orchestrates: cities -> fetch -> upsert -> feed_sync_runs
src/app/api/cron/events-sync/route.ts
vercel.json                         // add "crons"
.github/workflows/events-sync.yml   // workflow_dispatch backup that curls the route
```

**Upsert rules** (`upsert.ts`):

1. **Venue**: look up `venues` by `mapbox_id is null and lower(name) = lower(?) and lower(city) = lower(?)`; if none, insert `{name, city, country, lat, lng, city_lat: lat, city_lng: lng}` with the **service client**. Cache venue ids in a Map for the run so the same venue is not looked up 200 times.
2. **Event**: `upsert` on `(source, external_id)` — pass `onConflict: "source,external_id"`. Set every mapped column, `status: 'approved'`, `last_seen_at: now`, `updated_at: now`. Batch 100 rows per upsert call.
3. **Ticket links**: delete existing links for the event where
   `provider = 'ticketmaster'` then insert the new one (simplest correct
   idempotency; the table is small). Use `.select()` on the delete.
4. Count upserted/skipped/errors and return them.

**Route** (`/api/cron/events-sync`):

- `runtime = "nodejs"`, `maxDuration = 300` (Vercel Hobby allows up to 300 s
  for cron-invoked functions; verify in the dashboard — if the plan limit is
  lower, reduce cities per run and rotate through them using
  `feed_sync_runs` to pick up where the last run stopped).
- Auth: header `authorization: Bearer <CRON_SECRET>` (this is what Vercel
  Cron sends when `CRON_SECRET` is set). Compare with `timingSafeEqual` —
  copy the pattern from `src/app/api/inbound/route.ts`.
- Insert a `feed_sync_runs` row at start; update it at the end with counts.
  Wrap everything so a thrown error still writes `finished_at` and `notes`.
- Respond `{ ok, runId, apiCalls, upserted, errors }`.

**Schedule** (`vercel.json`):

```json
"crons": [{ "path": "/api/cron/events-sync", "schedule": "0 4 * * *" }]
```

04:00 UTC daily. Vercel Hobby permits one daily cron; if the project is on
Hobby and this is rejected, fall back to the GitHub workflow below as primary.

**Backup trigger** (`.github/workflows/events-sync.yml`): `workflow_dispatch`
only, one step: `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://gigtrotter.vercel.app/api/cron/events-sync`. Needs `CRON_SECRET` added as a
repo secret. Do NOT add a `schedule:` trigger — GitHub's schedule is not
reliable cron (see memory notes); manual is the point.

**Local test:** with keys in `.env.local`, run the dev server and
`curl -H "Authorization: Bearer $CRON_SECRET" localhost:3002/api/cron/events-sync`.
Then check `select source, api_calls, upserted, errors, notes from feed_sync_runs`
and `select count(*) from events where source='ticketmaster'`.

**Acceptance:** a local run inserts real UK events; running it twice does not
duplicate rows (count unchanged, `last_seen_at` advances); a wrong bearer
token returns 401.

---

## Phase 4 — Bandsintown for followed artists

Files: `src/lib/events/bandsintown/{map,fetch}.ts`, `sync-bandsintown.ts`, a
fixture, tests. Run from the same cron route after Ticketmaster.

- Input: `select distinct name from follows where kind='artist'` (service
  client). Cap 200 artists per run.
- `GET https://rest.bandsintown.com/artists/{encodeURIComponent(name)}/events?app_id=<BANDSINTOWN_APP_ID>&date=upcoming`.
  404 = unknown artist, skip quietly.
- Map: `externalId` = `event.id`; `startsAt` = `event.datetime` is **venue
  local time with no offset** — combine with `venue.timezone` (IANA) to get
  UTC (use `Intl` + a small helper; add tests for a BST and a UTC case, the
  same trap as `src/lib/dates.ts`). `venue.{name, city, country, latitude,
  longitude}`. `artistNames` = `[artist.name]`. `onSaleAt` = `on_sale_datetime`
  if present. Ticket links from `offers[]` where `type === "Tickets"`.
- **Cross-provider dedupe:** before upserting a Bandsintown event, look for a
  Ticketmaster event with the same lowercased headliner, same `venue_city`
  (case-insensitive), and `starts_at` on the same local calendar date in the
  venue timezone. If found, add the Bandsintown URL as an extra
  `event_ticket_links` row (provider `bandsintown`) on the TM event and skip
  the insert. Put the "same local date" comparison in a pure helper and test
  it.

**Acceptance:** follow an artist in the app, run the sync, see their dates
appear; a TM-listed show does not appear twice.

---

## Phase 5 — Alerts that need the feed

Extend `src/lib/alerts/generate.ts` (read its header comment first — it
explains the dedupe and throttle design; follow it exactly). Add two
candidate generators, both running as the user via the session client:

- **`tour_announce`**: events whose `artist_names && (the user's followed
  artist names)` and `created_at > now() - 7 days` and `starts_at > now()`.
  One alert per event; `dedupe_key = "tour:<event_id>"`; `url =
  external_url`; body like "Fontaines D.C. — Manchester, 14 Nov".
- **`on_sale`**: events with `on_sale_at between now() and now() + 7 days`
  that match a followed artist **or** a followed venue name, or a `wishlist`
  row (`kind in ('artist','venue')`). `dedupe_key = "onsale:<event_id>"`.
  Body: "Tickets go on sale Fri 10:00" — render the time with the existing
  client-side pattern (the alert body is text, so format it in the user's
  zone *at generation time* is wrong; instead store `event_at = on_sale_at`
  and let the Alerts page render it with `LocalDateTime`).

Put the matching/phrasing in `src/lib/alerts/phrasing.ts` (pure) and test it.
Update the Alerts page `KIND_LABEL`/`KIND_VARIANT` if either kind is missing.

**Acceptance:** with a followed artist that has a feed event, opening the app
produces exactly one `tour_announce` alert, and reopening produces no
duplicate.

---

## Phase 6 — Events page and launch

- `src/app/app/events/page.tsx`: add a **city filter** (distinct
  `venue_city` among upcoming events, as a `<select>` or chips; default to
  "All") and a **"For you"** section: upcoming events matching the user's
  followed artists/venues. Keep "Friends going". Type the query results
  properly (remove the `any`s while there).
- Event card: show `on_sale_at` as "On sale Fri 10:00" via `LocalDateTime`
  when it is in the future; show "Sold out" only when `is_sold_out`.
- `src/components/app-nav.tsx`: replace the single `SHOW_UNLAUNCHED` boolean
  with a set of launched flagged routes:
  `const LAUNCHED_FLAGGED = new Set(["/app/events"]);` and filter with
  `!n.flag || LAUNCHED_FLAGGED.has(n.href)`. Marketplace, Merch, Import stay
  hidden. `mobileOverflowItems` derives from the same list, so Events appears
  in the phone menu automatically.
- Roadmap page (`src/app/roadmap/page.tsx`): move "Gig discovery" from
  Later to Live with honest copy ("Ticketmaster-listed shows across the UK
  and Ireland, plus dates for artists you follow; independent venues can list
  directly"), and "Follow an artist or a venue" to Live.
- `TEST-CHECKLIST.md`: add section I with rows for: feed rows present, city
  filter, For-you section, tour_announce alert, on_sale alert, TM/Bandsintown
  dedupe, cron auth 401, `feed_sync_runs` row after a run.

**Acceptance:** Events visible in the nav on phone and desktop; page loads
under 1 s with real rows; all five verification commands pass.

---

## Phase 7 — Ops notes and cleanup rule (small)

- `docs/TECHNICAL_OVERVIEW.md`: one section on the feed (providers, cron,
  where to look when it breaks: `feed_sync_runs`).
- `PARKED.md`: note the two provider gaps honestly — Ticketmaster does not
  list most independent venues; Bandsintown only knows artists people follow.
  That is the argument for the promoter-submit flow, not a bug.
- Add a cleanup query to the plan (not a cron yet): events with
  `source='ticketmaster' and last_seen_at < now() - interval '14 days' and
  starts_at > now()` are shows the provider stopped returning — likely
  cancelled. Leave deletion as a manual decision for now; just document it.

---

## Not in scope (deliberately)

- Push notifications (native build).
- A "near me" filter using device location — needs a permissions flow; the
  city filter covers it for now.
- Price-drop alerts — Ticketmaster price ranges are not stable enough to
  compare run-to-run without noise. Revisit with data.
- Skiddle. Worth adding once independent-venue coverage matters more than
  setup time; the `FeedEvent` contract means it is one more `map.ts`.

## Hand-off prompt for the builder

> Build the events feed for GigTrotter following `docs/PLAN-EVENTS-FEED.md`
> exactly, one phase at a time, starting at Phase 1. Read `CLAUDE.md` and the
> plan's "Repo conventions" section before touching code. After each phase:
> run `pnpm typecheck && pnpm lint && pnpm check:rls && pnpm test:logic &&
> pnpm build`, commit with a prose message explaining why, push, and confirm
> CI is green before starting the next phase. Do not apply migrations. Do not
> reopen the decisions in the table at the top. If something in the plan
> turns out to be wrong against the real API response or the real schema,
> stop and say exactly what differs rather than improvising around it.
