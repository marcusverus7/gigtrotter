-- ─────────────────────────────────────────────────────────────────────────────
-- GigTrotter — Pricing pivot, marketplace, follows, imports
--
-- Pivots:
--   • GigTrotter+ is a perks club, NOT a feature paywall. Free tier stays
--     genuinely good (per §9). The pro_perks table is a catalogue; member
--     perks are realised through unlock checks at use-time.
--   • Anti-scalper resale marketplace: listings capped at face_value enforced
--     in DB. Booking fees go to a future Stripe Connect payout flow.
--   • Affiliate is expanded: alerts already had partner+url; we add a
--     dedicated affiliate_partners table so the click-through endpoint can
--     reach for vetted partner ids beyond what an alert carries.
--   • Imports: each source (Setlist.fm, Spotify, Songkick, Bandsintown, Last.fm,
--     Eventbrite, Apple/Google Wallet, Gmail backfill) lands as an import_job
--     row; the eventual rows feed the same captures pipeline.
--   • Follows: artists, promoters, venues. RA-style.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── enums ──────────────────────────────────────────────────────────────────
create type follow_kind as enum ('artist', 'promoter', 'venue');
create type listing_status as enum (
  'draft', 'live', 'reserved', 'sold', 'cancelled', 'expired'
);
create type import_source as enum (
  'setlistfm', 'spotify', 'songkick', 'bandsintown', 'lastfm',
  'eventbrite', 'apple_wallet', 'google_wallet', 'gmail_backfill'
);
create type import_status as enum (
  'queued', 'running', 'partial', 'done', 'failed'
);

-- ── follows ────────────────────────────────────────────────────────────────
-- Lightweight, public-to-friends follow graph. Drives the discovery feed
-- (events near a followed entity), the wishlist alert engine, and the
-- "what's [followee] doing next" surface.
create table public.follows (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  kind         follow_kind not null,
  name         text not null,
  -- External id when we have one: setlistfm artist id, eventbrite organizer id,
  -- mapbox poi id for venues. Lookup helpers use this for crossref.
  external_id  text,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  unique (user_id, kind, name)
);

create index follows_user_kind_idx on public.follows (user_id, kind);

alter table public.follows enable row level security;
create policy "follows: owner only" on public.follows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── pro_perks ──────────────────────────────────────────────────────────────
-- Catalogue of perks GigTrotter+ members can claim. Entries are managed by
-- the platform (service-role); end-users only ever read.
create table public.pro_perks (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,        -- 'discount' | 'vip_access' | 'prize_draw' | 'fee_waiver'
  partner      text not null,        -- 'ticketmaster' | 'dice' | 'skyscanner' | 'booking'
  title        text not null,
  body         text not null,
  cta_url      text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  region       text,                 -- ISO country code; null = global
  -- Free users see a teaser preview; Plus members get the real cta_url.
  preview      boolean not null default true,
  created_at   timestamptz not null default now()
);

create index pro_perks_active_idx on public.pro_perks (ends_at desc) where ends_at >= now();

alter table public.pro_perks enable row level security;
create policy "pro_perks: read all" on public.pro_perks
  for select using (true);
-- writes via service-role only

-- A claim log so we can settle commissions with partners.
create table public.pro_perk_claims (
  id           uuid primary key default gen_random_uuid(),
  perk_id      uuid not null references public.pro_perks on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  claimed_at   timestamptz not null default now()
);

create index pro_perk_claims_user_idx on public.pro_perk_claims (user_id, claimed_at desc);

alter table public.pro_perk_claims enable row level security;
create policy "pro_perk_claims: owner only" on public.pro_perk_claims
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── marketplace ────────────────────────────────────────────────────────────
-- Anti-scalper ticket resale. Sellers list a wallet_item at face_value or
-- below — the check constraint enforces it. Buyers pay via Stripe Connect
-- (wired post-MVP); GigTrotter takes a booking fee on each transaction.
create table public.listings (
  id              uuid primary key default gen_random_uuid(),
  seller_id       uuid not null references auth.users on delete cascade,
  wallet_item_id  uuid not null references public.wallet_items on delete cascade,
  face_value_cents  integer not null check (face_value_cents >= 0),
  asking_price_cents integer not null check (asking_price_cents >= 0),
  currency        text not null default 'GBP',
  notes           text,
  status          listing_status not null default 'draft',
  -- Booking fee taken from the BUYER per §9 monetisation. % is set at sale time.
  fee_bps         smallint not null default 700,    -- 7.00%
  created_at      timestamptz not null default now(),
  expires_at      timestamptz,
  -- THE ANTI-SCALPER RULE — enforced in the database, not the UI.
  check (asking_price_cents <= face_value_cents)
);

create index listings_status_idx on public.listings (status, created_at desc);
create index listings_wallet_idx on public.listings (wallet_item_id);

alter table public.listings enable row level security;

-- Sellers manage their own listings; buyers + everyone can browse 'live' ones.
create policy "listings: read live or own" on public.listings
  for select using (
    status = 'live'
    or seller_id = auth.uid()
  );

create policy "listings: seller write own" on public.listings
  for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());

-- offers are buyer-initiated holds + sale records.
create table public.offers (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings on delete cascade,
  buyer_id     uuid not null references auth.users on delete cascade,
  amount_cents integer not null,
  fee_cents    integer not null default 0,
  state        text not null default 'pending'
    check (state in ('pending', 'accepted', 'rejected', 'cancelled', 'paid', 'transferred', 'refunded')),
  stripe_payment_intent text,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);

create index offers_listing_idx on public.offers (listing_id, state);
create index offers_buyer_idx on public.offers (buyer_id, created_at desc);

alter table public.offers enable row level security;
create policy "offers: buyer or seller" on public.offers
  for select using (
    buyer_id = auth.uid()
    or exists (
      select 1 from public.listings l
       where l.id = offers.listing_id and l.seller_id = auth.uid()
    )
  );
create policy "offers: buyer write own" on public.offers
  for insert with check (buyer_id = auth.uid());
create policy "offers: parties update" on public.offers
  for update using (
    buyer_id = auth.uid()
    or exists (
      select 1 from public.listings l
       where l.id = offers.listing_id and l.seller_id = auth.uid()
    )
  )
  with check (true);

-- Ticket transfer log — for non-resale ticket handoffs between friends.
create table public.transfers (
  id              uuid primary key default gen_random_uuid(),
  from_user_id    uuid not null references auth.users on delete cascade,
  to_user_id      uuid not null references auth.users on delete cascade,
  wallet_item_id  uuid not null references public.wallet_items on delete cascade,
  state           text not null default 'pending'
    check (state in ('pending', 'accepted', 'declined', 'expired')),
  message         text,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);

create index transfers_to_idx on public.transfers (to_user_id, state);
create index transfers_from_idx on public.transfers (from_user_id, created_at desc);

alter table public.transfers enable row level security;
create policy "transfers: parties only" on public.transfers
  for all using (
    from_user_id = auth.uid() or to_user_id = auth.uid()
  )
  with check (
    from_user_id = auth.uid() or to_user_id = auth.uid()
  );

-- ── import_jobs ───────────────────────────────────────────────────────────
-- Tracks each user's runs of an importer. The actual ingestion writes to
-- captures and wallet_items via the same pipeline used by the share-sheet.
create table public.import_jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  source       import_source not null,
  status       import_status not null default 'queued',
  found        integer not null default 0,
  imported     integer not null default 0,
  duplicates   integer not null default 0,
  errors       integer not null default 0,
  cursor       jsonb,                      -- per-source pagination state
  log          text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create index import_jobs_user_idx on public.import_jobs (user_id, created_at desc);

alter table public.import_jobs enable row level security;
create policy "import_jobs: owner only" on public.import_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── integrations ──────────────────────────────────────────────────────────
-- Stores OAuth tokens for each user × source. Tokens are encrypted at rest
-- in V1+ — for the phase-8 stub the column accepts the raw value but the
-- access pattern goes through a service-role-only RPC.
create table public.integrations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  source        import_source not null,
  access_token  text,
  refresh_token text,
  scope         text,
  expires_at    timestamptz,
  external_id   text,                      -- e.g. spotify user id
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, source)
);

alter table public.integrations enable row level security;
create policy "integrations: owner only" on public.integrations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── helper: is_plus(target_user) ──────────────────────────────────────────
create or replace function public.is_plus(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select plan = 'plus' from profiles where id = target_user),
    false
  );
$$;
grant execute on function public.is_plus(uuid) to authenticated;
