-- ─────────────────────────────────────────────────────────────────────────────
-- 0024 — trip clustering window
--
-- trip_assemble's look-ahead window was asymmetric with its attach window: a
-- flight on day 0 could see a gig on day 5 and open a trip, but the gig could
-- only attach within 18h of the trip's end — so the flight sat in a one-item
-- trip and the gig in none, which is exactly the "solo flights don't deserve
-- a trip" case the original comment said it avoided.
--
-- Both windows are 7 days now, a trip must contain travel (two gigs a week
-- apart at home are not a trip), wishlist items never cluster, and trips left
-- empty by a deletion or a date edit are dropped. The app now calls this RPC
-- after every wallet insert, date edit and delete rather than only when the
-- Re-cluster button is pressed.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.trip_assemble(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  slack interval := interval '18 hours';
  reach interval := interval '7 days';
  item record;
  matched_trip_id uuid;
  cluster_starts timestamptz;
  cluster_ends timestamptz;
begin
  if target_user <> auth.uid() then
    raise exception 'forbidden';
  end if;

  for item in
    select w.id, w.starts_at, w.ends_at, w.kind, w.title
      from wallet_items w
     where w.user_id = target_user
       and w.trip_id is null
       and w.starts_at is not null
       and w.status <> 'wishlist'
       and w.kind in ('flight', 'stay', 'ticket')
     order by w.starts_at asc
  loop
    matched_trip_id := null;

    -- Attach to an existing trip within reach of its end, or overlapping it.
    select t.id, t.starts_at, t.ends_at
      into matched_trip_id, cluster_starts, cluster_ends
      from trips t
     where t.user_id = target_user
       and t.auto_assembled = true
       and item.starts_at <= (t.ends_at + reach)
       and coalesce(item.ends_at, item.starts_at) >= (t.starts_at - slack)
     order by t.starts_at desc
     limit 1;

    if matched_trip_id is not null then
      update trips
         set starts_at = least(starts_at, item.starts_at),
             ends_at = greatest(ends_at, coalesce(item.ends_at, item.starts_at + interval '4 hours'))
       where id = matched_trip_id;

      update wallet_items set trip_id = matched_trip_id where id = item.id;
    else
      -- Open a trip only when there is travel in it: a ticket needs a flight
      -- or stay within reach; a flight or stay needs any other clusterable
      -- item. Two gigs a week apart at home are not a trip.
      if exists (
        select 1 from wallet_items o
         where o.user_id = target_user
           and o.id <> item.id
           and o.starts_at is not null
           and o.status <> 'wishlist'
           and (
             (item.kind = 'ticket' and o.kind in ('flight', 'stay'))
             or (item.kind in ('flight', 'stay') and o.kind in ('flight', 'stay', 'ticket'))
           )
           and o.starts_at between (item.starts_at - reach)
                              and (coalesce(item.ends_at, item.starts_at) + reach)
      ) then
        insert into trips (user_id, title, starts_at, ends_at, auto_assembled)
          values (
            target_user,
            'Trip · ' || to_char(item.starts_at, 'Mon YYYY'),
            item.starts_at,
            coalesce(item.ends_at, item.starts_at + interval '1 day'),
            true
          )
          returning id into matched_trip_id;
        update wallet_items set trip_id = matched_trip_id where id = item.id;
      end if;
    end if;
  end loop;

  -- Trips emptied by deletions or date edits: drop them.
  delete from trips t
   where t.user_id = target_user
     and t.auto_assembled = true
     and not exists (select 1 from wallet_items w where w.trip_id = t.id);
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 0025 — bound follows.name in the database
--
-- `FollowInput` in src/features/follows/actions.ts caps the name at 120
-- characters, but that check only runs in the server action. The Supabase anon
-- key ships inside the client bundle by design, and the row-owner policy on
-- `follows` grants a signed-in user full insert rights — so anyone can POST
-- straight to /rest/v1/follows and store a multi-kilobyte name, bypassing the
-- action entirely.
--
-- Those names are not inert. They are interpolated into a Bandsintown URL path
-- by the nightly sync (a huge path 414s, and the error text lands in
-- feed_sync_runs.notes), and they build the PostgREST array filters behind the
-- events "For you" rail and the tour/on-sale alerts. The sync also draws one
-- global 200-artist budget from a single 1,000-row select, so one account's
-- rows can crowd out everyone else's followed artists.
--
-- The code re-applies the bound as well (dedupeNames skips over-long names);
-- this is the half that holds regardless of which client wrote the row.
--
-- Existing rows are truncated first so the constraint can be added validated.
-- ─────────────────────────────────────────────────────────────────────────────

update public.follows
   set name = left(name, 120)
 where char_length(name) > 120;

alter table public.follows
  drop constraint if exists follows_name_len;

alter table public.follows
  add constraint follows_name_len
  check (char_length(name) between 1 and 120);

-- Same exposure, same shape: wishlist.name feeds the on-sale alert filters.
update public.wishlist
   set name = left(name, 120)
 where char_length(name) > 120;

alter table public.wishlist
  drop constraint if exists wishlist_name_len;

alter table public.wishlist
  add constraint wishlist_name_len
  check (char_length(name) between 1 and 120);


-- ─────────────────────────────────────────────────────────────────────────────
-- 0026 — three policy gaps found by the November 2026 review
--
-- 1) event_interests was `for select using (true)`, and profiles is read-all,
--    so anyone holding the anon key (it ships in the bundle; no session
--    needed) could list "user X is GOING to event Y on date Z" for every
--    future event — exactly the disclosure the experiences time-shift rule
--    exists to prevent. Worse, Add-to-wallet auto-enrolled the user as going.
--    Rows are now visible to their owner and their accepted friends; the
--    public "N going" numbers come from an aggregate RPC instead.
--
-- 2) merch_items / merch_variants / merch_drops let any signed-in user publish
--    to the global store (`seller manages own` is `for all`), and published
--    rows render on LAUNCHED pages — venue, artist and event rails. There is
--    no seller UI, so client writes are revoked; seeding is service-role only.
--
-- 3) The avatars bucket had an INSERT policy but no UPDATE policy, so the
--    second avatar change (upsert: true) was denied.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) event_interests ───────────────────────────────────────────────────────

drop policy if exists "event_interests: public read" on public.event_interests;

create policy "event_interests: own and friends read" on public.event_interests
  for select using (
    auth.uid() = user_id
    or public.are_friends(user_id, auth.uid())
  );

create or replace function public.event_interest_counts(target_event uuid)
returns table (interested bigint, going bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where interest_type = 'interested') as interested,
    count(*) filter (where interest_type = 'going') as going
  from public.event_interests
  where event_id = target_event;
$$;

grant execute on function public.event_interest_counts(uuid) to authenticated, anon;

-- Batch variant for the events grid.
create or replace function public.event_interest_counts_for(target_events uuid[])
returns table (event_id uuid, interested bigint, going bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    event_id,
    count(*) filter (where interest_type = 'interested') as interested,
    count(*) filter (where interest_type = 'going') as going
  from public.event_interests
  where event_id = any(target_events)
  group by event_id;
$$;

grant execute on function public.event_interest_counts_for(uuid[]) to authenticated;

-- ── 2) merch: no client writes until there is a seller flow ──────────────────

revoke insert, update, delete on public.merch_items from authenticated, anon;
revoke insert, update, delete on public.merch_variants from authenticated, anon;
revoke insert, update, delete on public.merch_drops from authenticated, anon;

-- ── 3) avatars: allow replacing your own ─────────────────────────────────────

drop policy if exists "avatars: owner update" on storage.objects;
create policy "avatars: owner update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Verify:
--   select policyname from pg_policies where tablename = 'event_interests';
--   select privilege_type from information_schema.role_table_grants
--     where table_name = 'merch_items' and grantee = 'authenticated';   -- SELECT only
--   select * from public.event_interest_counts('<any event id>');


-- ─────────────────────────────────────────────────────────────────────────────
-- 0027 — two more alert kinds
--
-- anniversary     "One year ago tonight" — the On-this-day card promoted to a
--                 real alert, which is what Rail, GigLog and Concert Archives
--                 all lead with.
-- friend_request  A request or an acceptance used to be visible only if the
--                 other person happened to open the People page.
--
-- The generator inserts these in their own upsert, so until this is applied
-- the enum rejects them without touching the other kinds.
-- ─────────────────────────────────────────────────────────────────────────────

alter type alert_kind add value if not exists 'anniversary';
alter type alert_kind add value if not exists 'friend_request';

-- Verify: select unnest(enum_range(null::alert_kind));


-- ─────────────────────────────────────────────────────────────────────────────
-- 0028 — setlists on pins, a want-a-ticket waitlist, and CSV import
--
-- 1) experiences.setlist — the songs played, fetched from setlist.fm the
--    morning after (or when the pin is opened), with the id and the public
--    URL the API's terms ask us to credit. setlist_checked_at stops a pin
--    with no setlist being looked up on every open.
--
-- 2) event_waitlist — "Want one" on a sold-out feed event. Owner-only rows;
--    the public count comes from an aggregate RPC, same pattern as 0026.
--
-- 3) import_source gains 'csv' so a pasted spreadsheet gets an import_jobs
--    row like every other source.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.experiences
  add column if not exists setlist jsonb,
  add column if not exists setlistfm_id text,
  add column if not exists setlist_checked_at timestamptz;

create table if not exists public.event_waitlist (
  user_id    uuid not null references auth.users on delete cascade,
  event_id   uuid not null references public.events on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

alter table public.event_waitlist enable row level security;

drop policy if exists "event_waitlist: owner only" on public.event_waitlist;
create policy "event_waitlist: owner only" on public.event_waitlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists event_waitlist_event_idx on public.event_waitlist (event_id);

create or replace function public.event_waitlist_count(target_event uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.event_waitlist where event_id = target_event;
$$;

grant execute on function public.event_waitlist_count(uuid) to authenticated, anon;

alter type import_source add value if not exists 'csv';

-- Verify:
--   select column_name from information_schema.columns
--     where table_name = 'experiences' and column_name like 'setlist%';
--   select * from public.event_waitlist_count('<any event id>');


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
