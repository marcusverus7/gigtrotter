-- ─────────────────────────────────────────────────────────────────────────────
-- GigTrotter — Merch Store
--
-- Band/artist merch linked to gigs and promoters. Three fulfilment modes:
--   • ship_to_home: standard delivery
--   • collect_at_venue: buyer brings QR proof of purchase to a gig, collects
--     at the merch stand. Links to a wallet_item (the gig) for geofence.
--   • digital: PDFs, prints, etc. (future)
--
-- Merch drops support presales and limited editions with stock caps and
-- time windows. Orders are placed via the marketplace Stripe Connect flow
-- (same platform account) — the artist receives payout minus platform fee.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── enums ──────────────────────────────────────────────────────────────────
create type merch_fulfilment as enum ('ship_to_home', 'collect_at_venue', 'digital');
create type merch_order_status as enum (
  'pending', 'confirmed', 'shipped', 'ready_to_collect', 'collected', 'cancelled', 'refunded'
);
create type merch_drop_status as enum ('upcoming', 'live', 'sold_out', 'ended');

-- ── merch_items ───────────────────────────────────────────────────────────
-- A product listed by an artist/promoter/venue. Images stored in the
-- captures bucket under merch/ prefix.
create table public.merch_items (
  id              uuid primary key default gen_random_uuid(),
  seller_id       uuid not null references auth.users on delete cascade,
  title           text not null,
  description     text,
  images          text[] not null default '{}',
  -- Link to artist/promoter/venue name (matches follows.name for discovery)
  artist_name     text,
  -- Link to a specific venue (for venue-exclusive merch)
  venue_id        uuid references public.venues on delete set null,
  -- Fulfilment options this item supports
  fulfilment      merch_fulfilment[] not null default '{ship_to_home}',
  -- Base price in cents; variants can override
  price_cents     int not null check (price_cents >= 0),
  currency        text not null default 'GBP',
  -- Platform fee in basis points (e.g. 700 = 7%)
  fee_bps         int not null default 700,
  -- Whether this item is published and visible
  published       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index merch_items_seller_idx on public.merch_items (seller_id);
create index merch_items_artist_idx on public.merch_items (artist_name) where artist_name is not null;

alter table public.merch_items enable row level security;
create policy "merch_items: public read when published" on public.merch_items
  for select using (published = true);
create policy "merch_items: seller manages own" on public.merch_items
  for all using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

-- ── merch_variants ────────────────────────────────────────────────────────
-- Size/colour/edition variants with optional stock tracking.
create table public.merch_variants (
  id              uuid primary key default gen_random_uuid(),
  merch_item_id   uuid not null references public.merch_items on delete cascade,
  label           text not null,  -- e.g. "M / Black", "XL / White"
  sku             text,
  price_cents     int,            -- null = use item base price
  stock           int,            -- null = unlimited
  sold_count      int not null default 0,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

create index merch_variants_item_idx on public.merch_variants (merch_item_id);

alter table public.merch_variants enable row level security;
create policy "merch_variants: public read" on public.merch_variants
  for select using (
    exists (select 1 from public.merch_items where id = merch_item_id and published = true)
  );
create policy "merch_variants: seller manages" on public.merch_variants
  for all using (
    exists (select 1 from public.merch_items where id = merch_item_id and seller_id = auth.uid())
  ) with check (
    exists (select 1 from public.merch_items where id = merch_item_id and seller_id = auth.uid())
  );

-- ── merch_drops ───────────────────────────────────────────────────────────
-- Time-limited presale or limited-edition drop. Can link to a gig
-- (wallet_item) for "presale unlocks when you buy the gig ticket" flows.
create table public.merch_drops (
  id              uuid primary key default gen_random_uuid(),
  merch_item_id   uuid not null references public.merch_items on delete cascade,
  title           text not null,          -- "Glastonbury 2026 Presale"
  description     text,
  status          merch_drop_status not null default 'upcoming',
  -- Time window
  opens_at        timestamptz not null,
  closes_at       timestamptz,
  -- Stock cap for the drop (across all variants)
  total_stock     int,
  total_sold      int not null default 0,
  -- Link to a gig: only ticket holders for this wallet_item can access
  linked_gig_id   uuid references public.wallet_items on delete set null,
  -- Link to a venue for "collect at this venue" drops
  collection_venue_id uuid references public.venues on delete set null,
  created_at      timestamptz not null default now()
);

create index merch_drops_item_idx on public.merch_drops (merch_item_id);
create index merch_drops_gig_idx on public.merch_drops (linked_gig_id) where linked_gig_id is not null;

alter table public.merch_drops enable row level security;
create policy "merch_drops: public read" on public.merch_drops
  for select using (
    exists (select 1 from public.merch_items where id = merch_item_id and published = true)
  );
create policy "merch_drops: seller manages" on public.merch_drops
  for all using (
    exists (select 1 from public.merch_items where id = merch_item_id and seller_id = auth.uid())
  ) with check (
    exists (select 1 from public.merch_items where id = merch_item_id and seller_id = auth.uid())
  );

-- ── merch_orders ──────────────────────────────────────────────────────────
create table public.merch_orders (
  id              uuid primary key default gen_random_uuid(),
  buyer_id        uuid not null references auth.users on delete cascade,
  status          merch_order_status not null default 'pending',
  fulfilment      merch_fulfilment not null default 'ship_to_home',
  -- Shipping address (encrypted in app layer before insert — plain for now)
  shipping_name   text,
  shipping_line1  text,
  shipping_line2  text,
  shipping_city   text,
  shipping_postcode text,
  shipping_country text,
  -- Collection: the gig wallet item for venue pickup
  collection_wallet_item_id uuid references public.wallet_items on delete set null,
  collection_venue_id       uuid references public.venues on delete set null,
  -- QR code secret for venue collection proof
  collection_code text unique,
  collected_at    timestamptz,
  -- Totals
  subtotal_cents  int not null,
  fee_cents       int not null,
  shipping_cents  int not null default 0,
  total_cents     int not null,
  currency        text not null default 'GBP',
  -- Stripe
  stripe_payment_intent_id text,
  stripe_transfer_id       text,
  -- Metadata
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index merch_orders_buyer_idx on public.merch_orders (buyer_id);
create index merch_orders_collection_code_idx on public.merch_orders (collection_code) where collection_code is not null;

alter table public.merch_orders enable row level security;
create policy "merch_orders: buyer reads own" on public.merch_orders
  for select using (auth.uid() = buyer_id);
create policy "merch_orders: buyer creates" on public.merch_orders
  for insert with check (auth.uid() = buyer_id);

-- ── merch_order_items ─────────────────────────────────────────────────────
create table public.merch_order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.merch_orders on delete cascade,
  merch_item_id   uuid not null references public.merch_items on delete cascade,
  variant_id      uuid references public.merch_variants on delete set null,
  drop_id         uuid references public.merch_drops on delete set null,
  quantity        int not null default 1 check (quantity > 0),
  unit_price_cents int not null,
  created_at      timestamptz not null default now()
);

create index merch_order_items_order_idx on public.merch_order_items (order_id);

alter table public.merch_order_items enable row level security;
create policy "merch_order_items: buyer reads own" on public.merch_order_items
  for select using (
    exists (select 1 from public.merch_orders where id = order_id and buyer_id = auth.uid())
  );
create policy "merch_order_items: buyer creates" on public.merch_order_items
  for insert with check (
    exists (select 1 from public.merch_orders where id = order_id and buyer_id = auth.uid())
  );

-- ── merch_gig_links ───────────────────────────────────────────────────────
-- Explicit link between merch items and gigs/experiences. Powers the
-- "merch for this gig" section on wallet item detail pages.
create table public.merch_gig_links (
  id              uuid primary key default gen_random_uuid(),
  merch_item_id   uuid not null references public.merch_items on delete cascade,
  wallet_item_id  uuid references public.wallet_items on delete cascade,
  venue_id        uuid references public.venues on delete cascade,
  artist_name     text,
  created_at      timestamptz not null default now(),
  unique (merch_item_id, wallet_item_id)
);

alter table public.merch_gig_links enable row level security;
create policy "merch_gig_links: public read" on public.merch_gig_links
  for select using (true);
