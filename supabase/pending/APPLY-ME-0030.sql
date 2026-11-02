-- ─────────────────────────────────────────────────────────────────────────────
-- 0030: face-value resale of GigTrotter-issued tickets.
--
-- A fan who cannot go lists a ticket they BOUGHT HERE at exactly the tier's
-- face value. The next fan buys it through the same Stripe checkout as a
-- primary sale (destination charge, face to the promoter, fee to the
-- platform). On payment the seller's ticket is voided, a fresh signed code is
-- issued to the buyer, and the seller's original payment is refunded for the
-- face value with the promoter's transfer reversed by the same amount — so
-- the promoter nets exactly one face value per seat, the seller gets their
-- money back on their card, and no ticket ever changes hands above face.
--
-- Listing rows are claimed atomically (open → reserved) when a checkout
-- starts and go back to open if it expires, so two buyers cannot pay for the
-- same seat. Writes are service-role only; buyers read open listings, sellers
-- read their own.
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type ticket_listing_status as enum ('open', 'reserved', 'sold', 'withdrawn');
exception when duplicate_object then null; end $$;

create table if not exists public.ticket_listings (
  id             uuid primary key default gen_random_uuid(),
  ticket_id      uuid not null references public.tickets on delete cascade,
  seller_id      uuid not null references auth.users on delete cascade,
  event_id       uuid not null references public.events on delete cascade,
  tier_id        uuid not null references public.ticket_tiers on delete restrict,
  /** Always the tier's face value at listing time; the action enforces it. */
  price_cents    integer not null check (price_cents > 0),
  currency       text not null default 'GBP',
  status         ticket_listing_status not null default 'open',
  buyer_order_id uuid,
  reserved_until timestamptz,
  created_at     timestamptz not null default now(),
  sold_at        timestamptz
);
create unique index if not exists ticket_listings_one_live
  on public.ticket_listings (ticket_id) where status in ('open', 'reserved');
create index if not exists ticket_listings_event_idx on public.ticket_listings (event_id, status);

alter table public.ticket_listings enable row level security;
drop policy if exists "listings: open or own" on public.ticket_listings;
create policy "listings: open or own" on public.ticket_listings
  for select using (status in ('open', 'reserved') or seller_id = auth.uid());
-- Inserts/updates: service client only (listing, checkout, webhook).

alter table public.orders add column if not exists listing_id uuid references public.ticket_listings on delete set null;
do $$ begin
  alter table public.ticket_listings
    add constraint ticket_listings_buyer_order_fk foreign key (buyer_order_id) references public.orders on delete set null;
exception when duplicate_object then null; end $$;

-- "A face-value ticket just went up" for the want-one list.
alter type alert_kind add value if not exists 'resale';

-- Verify: select policyname from pg_policies where tablename = 'ticket_listings';  -- one row
--         select column_name from information_schema.columns where table_name = 'orders' and column_name = 'listing_id';
