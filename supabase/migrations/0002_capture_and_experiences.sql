-- ─────────────────────────────────────────────────────────────────────────────
-- GigTrotter — Phase 2 schema additions
-- venues, captures, vendor_fingerprints, wallet_items, experiences, trips
--
-- This migration also lands the SAFETY-CRITICAL time-shift rule:
--   audience > inner ⇒ ends_at < now()
-- enforced in RLS, not in the UI. "I will be at X on date Y" is stalking fuel
-- and "my house is empty" is burglary fuel. RLS is the only place that's safe.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── enums ──────────────────────────────────────────────────────────────────
create type capture_source as enum ('screenshot', 'email', 'extension', 'manual');
create type capture_status as enum ('pending', 'confirmed', 'rejected');
create type wallet_kind as enum ('ticket', 'flight', 'stay', 'restaurant', 'other');
create type wallet_status as enum ('wishlist', 'going', 'tonight', 'attended', 'archived');
create type verified_by as enum ('none', 'geofence', 'ticket', 'manual');

-- ── venues ─────────────────────────────────────────────────────────────────
-- Canonical venues / locations. Many captures will reference the same venue;
-- this is where setlist.fm + Mapbox seed data lives.
create table public.venues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text,
  country     text,
  lat         double precision,
  lng         double precision,
  -- City-centroid coords used for the anon board (city-fuzzed pins).
  city_lat    double precision,
  city_lng    double precision,
  setlistfm_id text,
  mapbox_id   text,
  created_at  timestamptz not null default now(),
  unique (name, city, country)
);

create index venues_geo_idx on public.venues (lat, lng);
create index venues_name_idx on public.venues using gin (to_tsvector('simple', name));

alter table public.venues enable row level security;
create policy "venues: read all" on public.venues for select using (true);
-- Inserts via service role / RPC only. No client write policy.

-- ── captures ───────────────────────────────────────────────────────────────
-- Every inbound artefact and its parse result. The pipeline's spine.
-- storage_ref points at the encrypted blob in Storage; parse_json holds the
-- structured extraction; confidence drives the confirm-vs-review UX.
create table public.captures (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  source       capture_source not null,
  storage_ref  text,                       -- Supabase Storage object key (encrypted)
  parse_json   jsonb,                      -- {type, title, datetime, location, vendor, ...}
  confidence   real,                       -- 0..1
  vendor       text,                       -- ticketmaster, ryanair, booking, etc.
  status       capture_status not null default 'pending',
  error        text,                       -- parse failures keep their reason
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz
);

create index captures_user_status_idx on public.captures (user_id, status, created_at desc);
create index captures_vendor_idx on public.captures (vendor);

alter table public.captures enable row level security;

create policy "captures: owner only" on public.captures
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── vendor_fingerprints ────────────────────────────────────────────────────
-- Parsing cache. Second sighting of a Ryanair pass costs near zero — we hash
-- the layout (image perceptual hash or email template fingerprint), then
-- replay the field map instead of calling Claude vision.
create table public.vendor_fingerprints (
  id            uuid primary key default gen_random_uuid(),
  vendor        text not null,
  template_hash text not null unique,
  field_map     jsonb not null,
  hit_count     integer not null default 0,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index vendor_fingerprints_vendor_idx on public.vendor_fingerprints (vendor);

alter table public.vendor_fingerprints enable row level security;
create policy "vendor_fingerprints: read all" on public.vendor_fingerprints
  for select using (true);
-- Writes are service-role only.

-- ── trips ──────────────────────────────────────────────────────────────────
-- Trip auto-assembly container. Flight + hotel + event captures in the same
-- date range cluster into one trip object.
create table public.trips (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  title           text not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  auto_assembled  boolean not null default true,
  created_at      timestamptz not null default now()
);

create index trips_user_dates_idx on public.trips (user_id, starts_at);

alter table public.trips enable row level security;
create policy "trips: owner only" on public.trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── wallet_items ───────────────────────────────────────────────────────────
-- The lifecycle object. Status flips via trigger as time passes; geofence
-- attendance promotes to 'attended' and spawns/updates an experience row.
create table public.wallet_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  capture_id uuid references public.captures on delete set null,
  trip_id    uuid references public.trips on delete set null,
  venue_id   uuid references public.venues on delete set null,
  kind       wallet_kind not null,
  status     wallet_status not null default 'wishlist',
  title      text not null,             -- "Fontaines D.C." / "BA 1426 LHR→DUB"
  subtitle   text,                      -- venue · city, route, hotel name
  starts_at  timestamptz,
  ends_at    timestamptz,
  -- Encrypted barcode/QR payload. Decrypted client-side for the owner only,
  -- and blurred everywhere else until the event ends.
  barcode_ref text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wallet_items_user_status_idx
  on public.wallet_items (user_id, status, starts_at);

alter table public.wallet_items enable row level security;

create policy "wallet_items: owner only" on public.wallet_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger wallet_items_touch
  before update on public.wallet_items
  for each row execute function public.touch_updated_at();

-- ── experiences (pins) ─────────────────────────────────────────────────────
-- A confirmed memory. This is what the map renders.
-- Audience is per-pin. The time-shift rule lives in the SELECT policy below.
create table public.experiences (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  wallet_item_id uuid references public.wallet_items on delete set null,
  capture_id   uuid references public.captures on delete set null,
  trip_id      uuid references public.trips on delete set null,
  venue_id     uuid references public.venues on delete set null,
  kind         wallet_kind not null,
  title        text not null,
  subtitle     text,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  audience     audience not null default 'inner',
  verified_by  verified_by not null default 'none',
  rating       smallint check (rating between 1 and 5),
  review       text,
  photos       jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index experiences_user_idx on public.experiences (user_id, starts_at desc);
create index experiences_audience_idx on public.experiences (audience, ends_at);

alter table public.experiences enable row level security;

-- Always: the owner sees everything.
create policy "experiences: owner read" on public.experiences
  for select using (auth.uid() = user_id);

create policy "experiences: owner write" on public.experiences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── THE TIME-SHIFT RULE ──────────────────────────────────────────────────
-- Non-owners can read a pin only if:
--   1) audience > 'vault', AND
--   2) the event has already ended (ends_at < now()) UNLESS audience = 'inner'
--      and the viewer is in the owner's inner circle, AND
--   3) the audience tier matches the viewer's relationship:
--      - 'inner':   viewer is in owner's inner circle
--      - 'friends': viewer is an accepted friend
--      - 'open':    anyone (including unauthenticated, see anon_view below)
-- Future events ('ends_at >= now()') are only visible at 'inner' or below,
-- and only to inner-circle members. Database-enforced — not the UI.
create policy "experiences: time-shifted audience read" on public.experiences
  for select using (
    audience <> 'vault'
    and auth.uid() is not null
    and auth.uid() <> user_id
    and (
      -- Past events follow their tier.
      (ends_at < now() and (
        audience = 'open'
        or (audience = 'friends' and public.are_friends(user_id, auth.uid()))
        or (audience = 'inner'   and public.in_inner_circle(user_id, auth.uid()))
      ))
      or
      -- Future events: ONLY inner circle (regardless of pin's audience tier).
      (ends_at >= now() and public.in_inner_circle(user_id, auth.uid()))
    )
  );

create trigger experiences_touch
  before update on public.experiences
  for each row execute function public.touch_updated_at();

-- ── anonymous board view ───────────────────────────────────────────────────
-- The public, unauthenticated read surface. Lives at /b/<anon_hash>.
-- Pins are city-fuzzed (use venues.city_lat/city_lng, not lat/lng) and dates
-- are fuzzed to month. Source: experiences with audience='open' AND past.
-- Implemented as a security-invoker view over a security-definer function so
-- anon users (no JWT) can read it without bypassing RLS on the base table.

create or replace function public.anon_board(handle text)
returns table (
  id          uuid,
  kind        wallet_kind,
  title       text,
  subtitle    text,
  month       date,
  city        text,
  country     text,
  city_lat    double precision,
  city_lng    double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select id from public.profiles
     where anon_handle = handle and not anon_revoked
     limit 1
  )
  select
    e.id,
    e.kind,
    e.title,
    -- Strip venue from subtitle for true anonymity; keep only city/country.
    coalesce(v.city, v.country, e.subtitle) as subtitle,
    date_trunc('month', e.starts_at)::date as month,
    v.city,
    v.country,
    v.city_lat,
    v.city_lng
  from public.experiences e
  left join public.venues v on v.id = e.venue_id
  where e.user_id = (select id from target)
    and e.audience = 'open'
    and e.ends_at < now()
  order by e.starts_at desc
  limit 500;
$$;

grant execute on function public.anon_board(text) to anon, authenticated;

-- View-count bump for anon boards. Service-role rpc, called from /b/<hash>.
create or replace function public.bump_anon_view(handle text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set anon_views = anon_views + 1
   where anon_handle = handle and not anon_revoked;
$$;

grant execute on function public.bump_anon_view(text) to anon, authenticated;

-- ── storage buckets ───────────────────────────────────────────────────────
-- `captures` — encrypted source artefacts. Owner-only access.
-- `avatars` — public profile pictures.
-- `shares` — generated share cards (signed-URL only).
insert into storage.buckets (id, name, public)
values
  ('captures', 'captures', false),
  ('avatars', 'avatars', true),
  ('shares', 'shares', false)
on conflict (id) do nothing;

-- RLS on storage.objects — owner-only for captures.
create policy "captures storage: owner only"
  on storage.objects for all
  using (
    bucket_id = 'captures'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'captures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars storage: read all"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars storage: owner write"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
