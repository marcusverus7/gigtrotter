-- ─────────────────────────────────────────────────────────────────────────────
-- 0031 — pilot hardening (implementation brief 2026-11-02, phases 1 and 2)
--
-- Phase 1 — access control
--   SEC-01  achievements runs as the caller (security_invoker) and is no longer
--           readable by anon; the three admin_* click views are service-role
--           only. Supabase's default privileges grant every new public view to
--           anon + authenticated, which is how they leaked.
--   SEC-02  trip_assemble compared `target_user <> auth.uid()`; an anonymous
--           caller has a NULL uid, the comparison is NULL, and the guard never
--           fired. Every self-only RPC now rejects a NULL caller explicitly.
--   SEC-03  one future-plans rule: a person's going/interested row is visible
--           to themselves, to their Inner Circle while the event is upcoming,
--           and to accepted friends only once the event has ended — the same
--           rule the experiences time-shift policy already enforces.
--
-- Phase 2 — money, inventory and admission
--   PAY-01  provider state (orders.status = paid) and local fulfilment
--           (orders.fulfilled_at) are separate facts. All local issuance runs
--           inside fulfil_order_tx / fulfil_resale_tx, one transaction each,
--           keyed on (order, tier, unit_no) so a retry can never double-issue
--           and a crash can never leave half an order.
--   PAY-02  refunds are a ledger (requested → pending → succeeded | failed)
--           with a stable idempotency key per row; nothing is called
--           "refunded" until Stripe confirms it.
--   PAY-03  stripe_events is the webhook inbox: every verified event is stored
--           before it is acted on, so a crash is replayable.
--   PAY-04  event_staff: named, event-scoped door access without sharing the
--           promoter's login.
--   PAY-05  ops_actions: an audit row for every operator recovery action.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ SEC-01: views ═══════════════════════════════════════════════════════════

alter view public.achievements set (security_invoker = true);
revoke all on public.achievements from anon, public;
grant select on public.achievements to authenticated, service_role;

revoke all on public.admin_provider_clicks from anon, authenticated, public;
revoke all on public.admin_top_events_by_clicks from anon, authenticated, public;
revoke all on public.admin_daily_clicks from anon, authenticated, public;
grant select on public.admin_provider_clicks, public.admin_top_events_by_clicks, public.admin_daily_clicks to service_role;

-- ═══ SEC-02: NULL-safe self-only RPCs ════════════════════════════════════════

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
  if auth.uid() is null or target_user is null or target_user <> auth.uid() then
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

  delete from trips t
   where t.user_id = target_user
     and t.auto_assembled = true
     and not exists (select 1 from wallet_items w where w.trip_id = t.id);
end;
$$;

revoke all on function public.trip_assemble(uuid) from public, anon;
grant execute on function public.trip_assemble(uuid) to authenticated, service_role;

-- The three guards from 0015 used `is distinct from`, which is NULL-safe only
-- when exactly one side is NULL. Anonymous caller + NULL argument slipped
-- through (harmlessly — the bodies filter on user_id = NULL — but the intent
-- is "signed in and yourself", so say so).
create or replace function public.on_this_day(target_user uuid)
returns setof experiences
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or target_user is null or target_user <> auth.uid() then
    raise exception 'forbidden';
  end if;

  return query
    select *
      from experiences
     where user_id = target_user
       and extract(month from starts_at) = extract(month from now())
       and extract(day from starts_at) = extract(day from now())
       and starts_at < now() - interval '6 months'
     order by starts_at desc
     limit 20;
end;
$$;
revoke all on function public.on_this_day(uuid) from public, anon;

create or replace function public.who_else_going(target_user uuid)
returns table (
  wallet_item_id uuid,
  title text,
  starts_at timestamptz,
  friend_id uuid,
  friend_username text,
  friend_display_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or target_user is null or target_user <> auth.uid() then
    raise exception 'forbidden';
  end if;

  return query select * from public.who_else_going_unguarded(target_user);
end;
$$;
revoke all on function public.who_else_going(uuid) from public, anon;

create or replace function public.unread_alert_count(target_user uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null or target_user is null or target_user <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select count(*)::integer into n
    from public.alerts
   where user_id = target_user and state = 'unread';

  return coalesce(n, 0);
end;
$$;
revoke all on function public.unread_alert_count(uuid) from public, anon;

-- ═══ SEC-03: one future-plans rule for event_interests ═══════════════════════

drop policy if exists "event_interests: own and friends read" on public.event_interests;
drop policy if exists "event_interests: owner, inner circle, friends after" on public.event_interests;
create policy "event_interests: owner, inner circle, friends after" on public.event_interests
  for select using (
    auth.uid() = user_id
    or (
      auth.uid() is not null
      and (
        public.in_inner_circle(user_id, auth.uid())
        or (
          public.are_friends(user_id, auth.uid())
          and exists (
            select 1 from public.events e
             where e.id = event_interests.event_id
               and coalesce(e.ends_at, e.starts_at + interval '4 hours') < now()
          )
        )
      )
    )
  );

-- ═══ PAY-01: fulfilment state, separate from payment state ═══════════════════

alter table public.orders add column if not exists fulfilled_at timestamptz;
alter table public.orders add column if not exists fulfilment_outcome text
  check (fulfilment_outcome is null or fulfilment_outcome in ('issued', 'stale_listing_refund'));
alter table public.orders add column if not exists fulfilment_error text;
alter table public.orders add column if not exists stock_committed_at timestamptz;
alter table public.orders add column if not exists last_reconciled_at timestamptz;
alter table public.orders add column if not exists reconcile_note text;

create index if not exists orders_paid_unfulfilled_idx
  on public.orders (paid_at) where status = 'paid' and fulfilled_at is null;
create index if not exists orders_pending_expiry_idx
  on public.orders (expires_at) where status = 'pending';

-- Orders fulfilled by the pre-0031 code path are complete by construction
-- (status paid + tickets exist); mark them so the reconciler does not try
-- to re-issue them.
update public.orders o
   set fulfilled_at = coalesce(o.paid_at, o.created_at),
       fulfilment_outcome = 'issued',
       stock_committed_at = coalesce(o.paid_at, o.created_at)
 where o.status = 'paid'
   and o.fulfilled_at is null
   and exists (select 1 from public.tickets t where t.order_id = o.id);

-- One admission per (order, tier, unit). The unique index is the idempotency
-- boundary: two concurrent fulfilments of the same order cannot both insert
-- unit 1 of tier X.
alter table public.tickets add column if not exists unit_no integer;
create unique index if not exists tickets_order_unit_uq
  on public.tickets (order_id, tier_id, unit_no) where unit_no is not null;

-- ═══ CAP-03: which capture key encrypted this blob ═══════════════════════════
alter table public.captures add column if not exists key_version integer not null default 1;

-- ═══ PAY-03: webhook inbox ═══════════════════════════════════════════════════

create table if not exists public.stripe_events (
  id            text primary key,              -- Stripe event id (evt_…)
  type          text not null,
  order_id      uuid references public.orders on delete set null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  attempts      integer not null default 0,
  last_error    text,
  payload       jsonb not null
);
create index if not exists stripe_events_unprocessed_idx
  on public.stripe_events (received_at) where processed_at is null;
alter table public.stripe_events enable row level security;
-- No client policies: service role only.

-- ═══ PAY-02: refund ledger ═══════════════════════════════════════════════════

do $$ begin
  create type refund_status as enum ('requested', 'pending', 'succeeded', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists public.refunds (
  id                 uuid primary key default gen_random_uuid(),
  /** The order whose payment is being refunded (for a resale seller refund: the seller's original order). */
  order_id           uuid not null references public.orders on delete restrict,
  /** The order that caused it (the resale buyer's order), when different. */
  related_order_id   uuid references public.orders on delete set null,
  reason             text not null check (reason in ('resale_seller', 'resale_buyer_stale', 'promoter_refund', 'transfer_reversal', 'operator')),
  payment_intent_id  text,
  amount_cents       integer not null check (amount_cents > 0),
  currency           text not null default 'GBP',
  reverse_transfer   boolean not null default true,
  status             refund_status not null default 'requested',
  /** Sent to Stripe as the Idempotency-Key on every attempt for this row. */
  idempotency_key    text not null unique default gen_random_uuid()::text,
  stripe_refund_id   text unique,
  attempts           integer not null default 0,
  last_error         text,
  requested_by       uuid references auth.users on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  succeeded_at       timestamptz
);
create index if not exists refunds_open_idx on public.refunds (updated_at) where status in ('requested', 'pending');
create index if not exists refunds_order_idx on public.refunds (order_id);
alter table public.refunds enable row level security;
drop policy if exists "refunds: buyer reads own" on public.refunds;
create policy "refunds: buyer reads own" on public.refunds
  for select using (
    exists (select 1 from public.orders o where o.id = refunds.order_id and o.user_id = auth.uid())
  );
-- Writes: service role only (fulfilment transactions, refund processor, operator actions).

-- ═══ PAY-04: door staff ══════════════════════════════════════════════════════

create table if not exists public.event_staff (
  event_id    uuid not null references public.events on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  role        text not null default 'door' check (role in ('door')),
  added_by    uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_staff enable row level security;
drop policy if exists "event_staff: promoter manages" on public.event_staff;
create policy "event_staff: promoter manages" on public.event_staff
  for all using (
    exists (select 1 from public.events e where e.id = event_staff.event_id and e.promoter_id = auth.uid())
  ) with check (
    exists (select 1 from public.events e where e.id = event_staff.event_id and e.promoter_id = auth.uid())
  );
drop policy if exists "event_staff: staff reads own" on public.event_staff;
create policy "event_staff: staff reads own" on public.event_staff
  for select using (auth.uid() = user_id);

-- Door staff may read the event's tickets (to check in) but not orders or
-- payouts. The check-in write itself stays on the service client behind
-- the guarded action.
drop policy if exists "tickets: door staff reads for assigned events" on public.tickets;
create policy "tickets: door staff reads for assigned events" on public.tickets
  for select using (
    exists (select 1 from public.event_staff s where s.event_id = tickets.event_id and s.user_id = auth.uid())
  );

create or replace function public.can_check_in(target_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.events e where e.id = target_event and e.promoter_id = auth.uid())
    or exists (select 1 from public.event_staff s where s.event_id = target_event and s.user_id = auth.uid())
  );
$$;
revoke all on function public.can_check_in(uuid) from public, anon;
grant execute on function public.can_check_in(uuid) to authenticated, service_role;

-- ═══ PAY-05: operator audit ══════════════════════════════════════════════════

create table if not exists public.ops_actions (
  id          uuid primary key default gen_random_uuid(),
  actor       uuid references auth.users on delete set null,
  action      text not null,
  target      text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.ops_actions enable row level security;
-- No client policies: service role only.

-- ═══ PAY-01: transactional issuance ══════════════════════════════════════════
--
-- Node generates the signed codes (the HMAC key never enters the database)
-- and hands them in as [{tier_id, unit_no, code}] covering every unit on the
-- order. Everything local — wallet items, ticket rows, stock commit, the
-- "going" mark, fulfilled_at — happens in this one function, so it either
-- all lands or none of it does. Idempotent: a second call sees fulfilled_at
-- and returns {already: true}; two concurrent calls serialise on the order
-- row lock.

create or replace function public.fulfil_order_tx(target_order uuid, units jsonb, wallet_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  ev record;
  u record;
  li record;
  tier_name text;
  w uuid;
  issued integer := 0;
  expected integer;
  present integer;
begin
  select * into o from public.orders where id = target_order for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if o.status <> 'paid' then return jsonb_build_object('error', 'not_paid', 'status', o.status::text); end if;
  if o.fulfilled_at is not null then return jsonb_build_object('already', true, 'issued', 0); end if;
  if o.listing_id is not null then return jsonb_build_object('error', 'resale_order'); end if;

  select id, title, venue_id, venue_name, venue_city, starts_at, ends_at
    into ev from public.events where id = o.event_id;
  if not found then return jsonb_build_object('error', 'event_missing'); end if;

  for u in select * from jsonb_to_recordset(units) as x(tier_id uuid, unit_no integer, code text) loop
    if exists (select 1 from public.tickets t where t.order_id = o.id and t.tier_id = u.tier_id and t.unit_no = u.unit_no) then
      continue;
    end if;
    if not exists (
      select 1 from public.order_items oi
       where oi.order_id = o.id and oi.tier_id = u.tier_id and u.unit_no between 1 and oi.quantity
    ) then
      raise exception 'unit % of tier % is not on order %', u.unit_no, u.tier_id, o.id;
    end if;
    select name into tier_name from public.ticket_tiers where id = u.tier_id;

    insert into public.wallet_items (user_id, kind, status, title, subtitle, venue_id, starts_at, ends_at, purchased_via_platform, meta)
    values (
      o.user_id, 'ticket', wallet_status::wallet_status, ev.title,
      nullif(concat_ws(' · ', tier_name, ev.venue_name, ev.venue_city), ''),
      ev.venue_id, ev.starts_at, ev.ends_at, true,
      jsonb_build_object(
        'audience', 'inner', 'vendor', 'gigtrotter', 'gigtrotter_ticket_code', u.code,
        'tier', tier_name, 'order_id', o.id, 'event_id', ev.id
      )
    )
    returning id into w;

    insert into public.tickets (order_id, event_id, tier_id, owner_id, wallet_item_id, code, issued_as, unit_no)
    values (o.id, ev.id, u.tier_id, o.user_id, w, u.code, 'purchase', u.unit_no);
    issued := issued + 1;
  end loop;

  select coalesce(sum(quantity), 0) into expected from public.order_items where order_id = o.id;
  select count(*) into present from public.tickets where order_id = o.id and unit_no is not null;
  if present <> expected then
    raise exception 'order % has % of % units after issuance', o.id, present, expected;
  end if;

  if o.stock_committed_at is null then
    for li in select tier_id, quantity from public.order_items where order_id = o.id loop
      update public.ticket_tiers
         set reserved = greatest(0, reserved - li.quantity),
             sold = sold + li.quantity,
             status = case when sold + li.quantity >= quantity then 'sold_out'::ticket_tier_status else status end
       where id = li.tier_id;
    end loop;
    update public.orders set stock_committed_at = now() where id = o.id;
  end if;

  insert into public.event_interests (event_id, user_id, interest_type)
  values (ev.id, o.user_id, 'going')
  on conflict (event_id, user_id) do nothing;

  update public.orders
     set fulfilled_at = now(), fulfilment_outcome = 'issued', fulfilment_error = null
   where id = o.id;

  return jsonb_build_object('issued', issued, 'already', false);
end;
$$;
revoke all on function public.fulfil_order_tx(uuid, jsonb, text) from public, anon, authenticated;

-- Resale: void the seller's ticket, issue a fresh one to the buyer, mark the
-- listing sold and REQUEST the seller's refund in the ledger. If the seller's
-- ticket is no longer valid (scanned, transferred) the buyer's refund is
-- requested instead and no ticket is issued. Stripe is never called here;
-- the refund processor acts on the ledger afterwards and only then may an
-- order be called refunded.
create or replace function public.fulfil_resale_tx(target_order uuid, new_code text, wallet_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  l record;
  ev record;
  old record;
  seller_pi text;
  tier_name text;
  w uuid;
begin
  select * into o from public.orders where id = target_order for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if o.status <> 'paid' then return jsonb_build_object('error', 'not_paid', 'status', o.status::text); end if;
  if o.fulfilled_at is not null then return jsonb_build_object('already', true, 'issued', 0); end if;
  if o.listing_id is null then return jsonb_build_object('error', 'not_resale'); end if;

  select * into l from public.ticket_listings where id = o.listing_id for update;
  if not found then return jsonb_build_object('error', 'listing_missing'); end if;

  update public.tickets set status = 'transferred'
   where id = l.ticket_id and status = 'valid'
  returning id, order_id, wallet_item_id into old;

  if old.id is null then
    insert into public.refunds (order_id, related_order_id, reason, payment_intent_id, amount_cents, currency, reverse_transfer)
    values (o.id, o.id, 'resale_buyer_stale', o.stripe_payment_intent_id, o.total_cents, o.currency, true);
    update public.ticket_listings set status = 'withdrawn' where id = l.id;
    update public.orders
       set fulfilled_at = now(), fulfilment_outcome = 'stale_listing_refund', fulfilment_error = null
     where id = o.id;
    return jsonb_build_object('issued', 0, 'already', false, 'outcome', 'stale_listing_refund');
  end if;

  if old.wallet_item_id is not null then
    update public.wallet_items set status = 'archived' where id = old.wallet_item_id;
  end if;

  select id, title, venue_id, venue_name, venue_city, starts_at, ends_at
    into ev from public.events where id = l.event_id;
  if not found then raise exception 'event % missing', l.event_id; end if;
  select name into tier_name from public.ticket_tiers where id = l.tier_id;

  insert into public.wallet_items (user_id, kind, status, title, subtitle, venue_id, starts_at, ends_at, purchased_via_platform, meta)
  values (
    o.user_id, 'ticket', wallet_status::wallet_status, ev.title,
    nullif(concat_ws(' · ', tier_name, ev.venue_name, ev.venue_city), ''),
    ev.venue_id, ev.starts_at, ev.ends_at, true,
    jsonb_build_object(
      'audience', 'inner', 'vendor', 'gigtrotter', 'gigtrotter_ticket_code', new_code,
      'tier', tier_name, 'order_id', o.id, 'event_id', ev.id, 'transferred_from', l.seller_id
    )
  )
  returning id into w;

  insert into public.tickets (order_id, event_id, tier_id, owner_id, wallet_item_id, code, issued_as, transferred_from, unit_no)
  values (o.id, ev.id, l.tier_id, o.user_id, w, new_code, 'resale', l.seller_id, 1);

  update public.ticket_listings
     set status = 'sold', buyer_order_id = o.id, sold_at = now()
   where id = l.id;

  -- The seller's money back, from the payment they made, reversing the same
  -- amount of the promoter's transfer: one face value per seat, always.
  select stripe_payment_intent_id into seller_pi from public.orders where id = old.order_id;
  insert into public.refunds (order_id, related_order_id, reason, payment_intent_id, amount_cents, currency, reverse_transfer, status, last_error)
  values (
    old.order_id, o.id, 'resale_seller', seller_pi, l.price_cents, l.currency, true,
    case when seller_pi is null then 'failed'::refund_status else 'requested'::refund_status end,
    case when seller_pi is null then 'seller order has no payment intent' else null end
  );

  insert into public.event_interests (event_id, user_id, interest_type)
  values (ev.id, o.user_id, 'going')
  on conflict (event_id, user_id) do nothing;

  update public.orders
     set fulfilled_at = now(), fulfilment_outcome = 'issued', fulfilment_error = null
   where id = o.id;

  return jsonb_build_object('issued', 1, 'already', false, 'outcome', 'issued');
end;
$$;
revoke all on function public.fulfil_resale_tx(uuid, text, text) from public, anon, authenticated;

-- Operator refund of a whole order (event cancelled, promoter goodwill):
-- voids every valid ticket on the order and requests the refund. Stripe is
-- called by the processor; the order becomes 'refunded' only on success.
create or replace function public.request_order_refund_tx(target_order uuid, actor uuid, why text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  voided integer;
  existing uuid;
begin
  select * into o from public.orders where id = target_order for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if o.status <> 'paid' then return jsonb_build_object('error', 'not_paid', 'status', o.status::text); end if;
  if o.stripe_payment_intent_id is null then return jsonb_build_object('error', 'no_payment_intent'); end if;
  select id into existing from public.refunds
   where order_id = o.id and reason in ('promoter_refund', 'operator') and status <> 'failed' limit 1;
  if existing is not null then return jsonb_build_object('already', true, 'refund_id', existing); end if;

  update public.tickets set status = 'refunded' where order_id = o.id and status = 'valid';
  get diagnostics voided = row_count;
  update public.wallet_items w set status = 'archived'
   from public.tickets t where t.wallet_item_id = w.id and t.order_id = o.id and t.status = 'refunded';

  insert into public.refunds (order_id, reason, payment_intent_id, amount_cents, currency, reverse_transfer, requested_by)
  values (o.id, 'operator', o.stripe_payment_intent_id, o.total_cents, o.currency, true, actor)
  returning id into existing;

  insert into public.ops_actions (actor, action, target, detail)
  values (actor, 'refund_order', o.id::text, jsonb_build_object('reason', why, 'voided_tickets', voided, 'refund_id', existing));

  return jsonb_build_object('already', false, 'refund_id', existing, 'voided', voided);
end;
$$;
revoke all on function public.request_order_refund_tx(uuid, uuid, text) from public, anon, authenticated;

-- Verify:
--   select relname, reloptions from pg_class where relname = 'achievements';            -- {security_invoker=true}
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_name in ('achievements','admin_provider_clicks') order by 1;           -- no anon
--   select public.trip_assemble('00000000-0000-0000-0000-000000000000');                 -- as anon: forbidden
--   select policyname from pg_policies where tablename = 'event_interests';
--   select proname from pg_proc where proname in ('fulfil_order_tx','fulfil_resale_tx','request_order_refund_tx','can_check_in');
--   select column_name from information_schema.columns where table_name = 'orders' and column_name = 'fulfilled_at';
