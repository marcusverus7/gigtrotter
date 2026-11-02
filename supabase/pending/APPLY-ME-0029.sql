-- ─────────────────────────────────────────────────────────────────────────────
-- 0029 — primary ticketing
--
-- A promoter who submits an event sells tickets through GigTrotter. Stripe
-- Connect (Express) pays the promoter the full face value; the buyer pays a
-- small fee on top that covers Stripe and the platform; the ticket is a
-- static, signed code we issue, shown as a QR in the wallet and scanned at
-- the door from /app/scan. Because WE issued it, resale and transfer are
-- safe — the code is re-issued on transfer, so the old one dies.
--
-- Tables:
--   promoter_accounts  one row per promoter: Stripe connected account + state
--   ticket_tiers       "General £15", "Early bird £12" per event, with capacity
--   orders             one Checkout Session; pending until the webhook confirms
--   order_items        tier × quantity on an order
--   tickets            one row per admission; the code is what the door scans
--
-- Capacity is reserved atomically by reserve_tier() when Checkout starts and
-- released by release_tier() when the session expires, so two buyers cannot
-- both take the last ticket.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.promoter_accounts (
  user_id            uuid primary key references auth.users on delete cascade,
  stripe_account_id  text unique,
  charges_enabled    boolean not null default false,
  payouts_enabled    boolean not null default false,
  details_submitted  boolean not null default false,
  /** Buyer-side fee in basis points on face value, covering Stripe + platform. */
  fee_bps            integer not null default 500 check (fee_bps between 0 and 2000),
  fee_fixed_cents    integer not null default 20 check (fee_fixed_cents between 0 and 500),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.promoter_accounts enable row level security;
drop policy if exists "promoter_accounts: owner reads" on public.promoter_accounts;
create policy "promoter_accounts: owner reads" on public.promoter_accounts
  for select using (auth.uid() = user_id);
-- Writes come from the Stripe Connect routes through the service client only.

create type ticket_tier_status as enum ('draft', 'on_sale', 'paused', 'sold_out', 'ended');

create table if not exists public.ticket_tiers (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events on delete cascade,
  name             text not null,
  description      text,
  price_cents      integer not null check (price_cents >= 0),
  currency         text not null default 'GBP',
  quantity         integer not null check (quantity >= 0),
  sold             integer not null default 0 check (sold >= 0),
  reserved         integer not null default 0 check (reserved >= 0),
  max_per_order    integer not null default 6 check (max_per_order between 1 and 20),
  sales_start      timestamptz,
  sales_end        timestamptz,
  status           ticket_tier_status not null default 'on_sale',
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists ticket_tiers_event_idx on public.ticket_tiers (event_id, sort_order);
alter table public.ticket_tiers enable row level security;
drop policy if exists "ticket_tiers: public read" on public.ticket_tiers;
create policy "ticket_tiers: public read" on public.ticket_tiers
  for select using (true);
drop policy if exists "ticket_tiers: promoter manages own" on public.ticket_tiers;
create policy "ticket_tiers: promoter manages own" on public.ticket_tiers
  for all using (
    exists (select 1 from public.events e where e.id = ticket_tiers.event_id and e.promoter_id = auth.uid())
  ) with check (
    exists (select 1 from public.events e where e.id = ticket_tiers.event_id and e.promoter_id = auth.uid())
  );

create type order_status as enum ('pending', 'paid', 'expired', 'cancelled', 'refunded');

create table if not exists public.orders (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users on delete cascade,
  event_id                    uuid not null references public.events on delete cascade,
  status                      order_status not null default 'pending',
  currency                    text not null default 'GBP',
  face_cents                  integer not null default 0,
  fee_cents                   integer not null default 0,
  total_cents                 integer not null default 0,
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  buyer_email                 text,
  created_at                  timestamptz not null default now(),
  paid_at                     timestamptz,
  expires_at                  timestamptz
);
create index if not exists orders_user_idx on public.orders (user_id, created_at desc);
create index if not exists orders_event_idx on public.orders (event_id, status);
alter table public.orders enable row level security;
drop policy if exists "orders: owner reads" on public.orders;
create policy "orders: owner reads" on public.orders
  for select using (auth.uid() = user_id);
drop policy if exists "orders: promoter reads for own events" on public.orders;
create policy "orders: promoter reads for own events" on public.orders
  for select using (
    exists (select 1 from public.events e where e.id = orders.event_id and e.promoter_id = auth.uid())
  );
-- Inserts/updates: service client (checkout + webhook) only.

create table if not exists public.order_items (
  order_id         uuid not null references public.orders on delete cascade,
  tier_id          uuid not null references public.ticket_tiers on delete restrict,
  quantity         integer not null check (quantity > 0),
  unit_price_cents integer not null,
  primary key (order_id, tier_id)
);
alter table public.order_items enable row level security;
drop policy if exists "order_items: via order" on public.order_items;
create policy "order_items: via order" on public.order_items
  for select using (
    exists (select 1 from public.orders o where o.id = order_items.order_id
            and (o.user_id = auth.uid()
                 or exists (select 1 from public.events e where e.id = o.event_id and e.promoter_id = auth.uid())))
  );

create type ticket_status as enum ('valid', 'used', 'transferred', 'refunded', 'void');

create table if not exists public.tickets (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid references public.orders on delete set null,
  event_id         uuid not null references public.events on delete cascade,
  tier_id          uuid not null references public.ticket_tiers on delete restrict,
  owner_id         uuid not null references auth.users on delete cascade,
  wallet_item_id   uuid references public.wallet_items on delete set null,
  /** The signed code the door scans. Unique; re-issued on transfer. */
  code             text not null unique,
  status           ticket_status not null default 'valid',
  used_at          timestamptz,
  checked_in_by    uuid references auth.users on delete set null,
  transferred_from uuid references auth.users on delete set null,
  issued_as        text not null default 'purchase', -- purchase | comp | transfer
  created_at       timestamptz not null default now()
);
create index if not exists tickets_owner_idx on public.tickets (owner_id);
create index if not exists tickets_event_idx on public.tickets (event_id, status);
alter table public.tickets enable row level security;
drop policy if exists "tickets: owner reads" on public.tickets;
create policy "tickets: owner reads" on public.tickets
  for select using (auth.uid() = owner_id);
drop policy if exists "tickets: promoter reads for own events" on public.tickets;
create policy "tickets: promoter reads for own events" on public.tickets
  for select using (
    exists (select 1 from public.events e where e.id = tickets.event_id and e.promoter_id = auth.uid())
  );
-- Writes (issue, transfer, check-in): service client inside guarded actions.

-- ── capacity, atomically ─────────────────────────────────────────────────────

create or replace function public.reserve_tier(target_tier uuid, qty integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare ok boolean;
begin
  update public.ticket_tiers
     set reserved = reserved + qty
   where id = target_tier
     and status = 'on_sale'
     and sold + reserved + qty <= quantity
     and (sales_start is null or sales_start <= now())
     and (sales_end is null or sales_end > now())
  returning true into ok;
  return coalesce(ok, false);
end;
$$;

create or replace function public.release_tier(target_tier uuid, qty integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ticket_tiers set reserved = greatest(0, reserved - qty) where id = target_tier;
$$;

create or replace function public.commit_tier(target_tier uuid, qty integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ticket_tiers
     set reserved = greatest(0, reserved - qty),
         sold = sold + qty,
         status = case when sold + qty >= quantity then 'sold_out'::ticket_tier_status else status end
   where id = target_tier;
$$;

-- Service role only: these move stock.
revoke all on function public.reserve_tier(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_tier(uuid, integer) from public, anon, authenticated;
revoke all on function public.commit_tier(uuid, integer) from public, anon, authenticated;

-- Public "tickets left" without exposing the sold/reserved split per tier.
create or replace function public.tier_availability(target_event uuid)
returns table (tier_id uuid, remaining integer)
language sql
stable
security definer
set search_path = public
as $$
  select id, greatest(0, quantity - sold - reserved) from public.ticket_tiers
   where event_id = target_event and status in ('on_sale', 'sold_out');
$$;
grant execute on function public.tier_availability(uuid) to authenticated, anon;

-- Verify:
--   select proname from pg_proc where proname in ('reserve_tier','release_tier','commit_tier','tier_availability');
--   select policyname from pg_policies where tablename in ('tickets','orders','ticket_tiers');
