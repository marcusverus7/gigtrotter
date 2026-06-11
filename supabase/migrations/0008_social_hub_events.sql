-- ─────────────────────────────────────────────────────────────────────────────
-- GigTrotter — Social Hub / Events Discovery
--
-- Discoverable events sourced from external APIs (Songkick, Bandsintown,
-- Eventbrite, RA) and manual promoter submissions. Users can mark
-- interested/going, see friend overlap, and click through to ticket
-- providers. Every outbound click is tracked for partnership metrics.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── extensions ─────────────────────────────────────────────────────────────
create extension if not exists postgis;

-- ── enums ──────────────────────────────────────────────────────────────────
create type event_category as enum (
  'concert', 'festival', 'club_night', 'theatre', 'comedy', 'sport', 'other'
);
create type event_interest_type as enum ('interested', 'going');

-- ── events ─────────────────────────────────────────────────────────────────
-- Canonical event record. May be auto-created from API sync or manually
-- by promoters. De-duped on external_id + source.
create table public.events (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  category        event_category not null default 'concert',
  -- Artist / act info
  artist_names    text[] not null default '{}',
  headliner       text,
  -- Venue
  venue_id        uuid references public.venues on delete set null,
  venue_name      text,
  venue_city      text,
  venue_country   text,
  -- Location for geo search
  lat             double precision,
  lng             double precision,
  -- Timing
  starts_at       timestamptz,
  ends_at         timestamptz,
  doors_at        timestamptz,
  -- Media
  image_url       text,
  -- Pricing hint (display only — not authoritative)
  min_price_cents int,
  max_price_cents int,
  currency        text not null default 'GBP',
  -- Sold-out signal
  is_sold_out     boolean not null default false,
  -- External source tracking
  source          text,                -- 'songkick', 'bandsintown', 'ra', 'eventbrite', 'manual'
  external_id     text,                -- ID in the source system
  external_url    text,                -- canonical link at the source
  -- Promoter who submitted (if manual)
  promoter_id     uuid references auth.users on delete set null,
  promoter_name   text,
  -- Metadata
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index events_starts_at_idx on public.events (starts_at) where starts_at is not null;
create index events_category_idx on public.events (category);
create index events_venue_city_idx on public.events (venue_city) where venue_city is not null;
create index events_location_idx on public.events using gist (
  ST_SetSRID(ST_MakePoint(lng, lat), 4326)
) where lat is not null and lng is not null;
create unique index events_source_external_idx on public.events (source, external_id) where source is not null and external_id is not null;
create index events_artist_names_idx on public.events using gin (artist_names);
create index events_tags_idx on public.events using gin (tags);

alter table public.events enable row level security;
create policy "events: public read" on public.events
  for select using (true);
create policy "events: promoter manages own" on public.events
  for all using (auth.uid() = promoter_id) with check (auth.uid() = promoter_id);

-- ── event_ticket_links ────────────────────────────────────────────────────
-- Links to external ticket providers. Each event can have multiple
-- providers (Ticketmaster, DICE, See Tickets, etc.). Click-throughs are
-- tracked in event_outbound_clicks for partnership metrics.
create table public.event_ticket_links (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events on delete cascade,
  provider        text not null,       -- 'ticketmaster', 'dice', 'seetickets', 'eventbrite', 'ra', etc.
  provider_label  text not null,       -- "Buy on Ticketmaster"
  url             text not null,
  -- Price range from this provider
  min_price_cents int,
  max_price_cents int,
  currency        text not null default 'GBP',
  is_sold_out     boolean not null default false,
  -- Whether this is an affiliate link
  is_affiliate    boolean not null default false,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

create index event_ticket_links_event_idx on public.event_ticket_links (event_id);

alter table public.event_ticket_links enable row level security;
create policy "event_ticket_links: public read" on public.event_ticket_links
  for select using (true);

-- ── event_outbound_clicks ─────────────────────────────────────────────────
-- Every click on a ticket link is logged here. Powers the internal admin
-- dashboard for partnership pitches: "We sent X clicks to Ticketmaster
-- last month across Y events."
create table public.event_outbound_clicks (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events on delete cascade,
  ticket_link_id  uuid not null references public.event_ticket_links on delete cascade,
  user_id         uuid references auth.users on delete set null,
  provider        text not null,
  -- Denormalised for fast aggregation
  event_title     text,
  event_city      text,
  event_category  event_category,
  clicked_at      timestamptz not null default now()
);

create index outbound_clicks_provider_idx on public.event_outbound_clicks (provider, clicked_at);
create index outbound_clicks_event_idx on public.event_outbound_clicks (event_id);
create index outbound_clicks_user_idx on public.event_outbound_clicks (user_id) where user_id is not null;
create index outbound_clicks_time_idx on public.event_outbound_clicks (clicked_at);

alter table public.event_outbound_clicks enable row level security;
-- Users can insert their own clicks; only admins read (via service role)
create policy "outbound_clicks: user inserts own" on public.event_outbound_clicks
  for insert with check (auth.uid() = user_id);

-- ── event_interests ───────────────────────────────────────────────────────
-- "Interested" or "Going" per user per event. Powers friend overlap and
-- trending calculations.
create table public.event_interests (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  interest_type   event_interest_type not null default 'interested',
  created_at      timestamptz not null default now(),
  unique (event_id, user_id)
);

create index event_interests_event_idx on public.event_interests (event_id);
create index event_interests_user_idx on public.event_interests (user_id);

alter table public.event_interests enable row level security;
create policy "event_interests: public read" on public.event_interests
  for select using (true);
create policy "event_interests: user manages own" on public.event_interests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Aggregate views for admin dashboard ───────────────────────────────────

-- Provider click summary — partnership pitch data
create or replace view public.admin_provider_clicks as
select
  provider,
  count(*) as total_clicks,
  count(distinct user_id) as unique_users,
  count(distinct event_id) as unique_events,
  min(clicked_at) as first_click,
  max(clicked_at) as last_click,
  count(*) filter (where clicked_at > now() - interval '7 days') as clicks_7d,
  count(*) filter (where clicked_at > now() - interval '30 days') as clicks_30d
from public.event_outbound_clicks
group by provider;

-- Top events by click volume
create or replace view public.admin_top_events_by_clicks as
select
  e.id as event_id,
  e.title,
  e.venue_city,
  e.category,
  e.starts_at,
  count(c.*) as total_clicks,
  count(distinct c.user_id) as unique_users,
  array_agg(distinct c.provider) as providers_clicked
from public.events e
join public.event_outbound_clicks c on c.event_id = e.id
group by e.id
order by total_clicks desc;

-- Daily click trend for charts
create or replace view public.admin_daily_clicks as
select
  date_trunc('day', clicked_at) as day,
  provider,
  count(*) as clicks,
  count(distinct user_id) as unique_users
from public.event_outbound_clicks
group by day, provider
order by day desc;
