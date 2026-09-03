-- Events feed: the columns the sync needs, and a place to see that it ran
--
-- The schema has anticipated a feed since 0008 (source/external_id with a
-- unique index, geo index, ticket links, moderation that trusts synced rows).
-- Three columns were still missing, and there was nowhere to look when a
-- nightly sync silently stopped working.
--
-- Purely additive.

-- When tickets go on sale (Ticketmaster sales.public.startDateTime). Powers
-- the on_sale alert kind, which has existed since 0004 and never fired.
alter table public.events add column if not exists on_sale_at timestamptz;

-- When the feed last saw this row. Lets a later cleanup notice rows the
-- provider stopped returning (usually cancellations) without touching
-- promoter submissions, which have source = 'manual'.
alter table public.events add column if not exists last_seen_at timestamptz;

-- The venue's IANA timezone, from the provider. Cross-provider dedupe
-- compares "same local calendar date", which needs the venue's zone, not UTC.
alter table public.events add column if not exists timezone text;

create index if not exists events_on_sale_idx
  on public.events (on_sale_at) where on_sale_at is not null;
create index if not exists events_source_last_seen_idx
  on public.events (source, last_seen_at);

-- One row per sync run. The cron has no UI; this table is how anyone finds
-- out it ran, how much it did, and what went wrong first.
create table if not exists public.feed_sync_runs (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,               -- 'ticketmaster' | 'bandsintown'
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  api_calls    int not null default 0,
  upserted     int not null default 0,
  skipped      int not null default 0,
  errors       int not null default 0,
  notes        text
);
alter table public.feed_sync_runs enable row level security;
-- No policies on purpose: service role only.
