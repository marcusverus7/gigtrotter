-- ─────────────────────────────────────────────────────────────────────────────
-- GigTrotter — Phase 8+ schema additions
-- Adds: wallet_items.trip_id ALREADY EXISTS in 0002.
-- Adds: morning_after notification log so we don't ask twice.
-- Adds: trip auto-assembly helper RPC.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── morning_after_log ──────────────────────────────────────────────────────
-- Tracks which wallet items the user has already been prompted about. The
-- morning-after flow asks "how was it?" once and once only.
create table public.morning_after_log (
  user_id        uuid not null references auth.users on delete cascade,
  wallet_item_id uuid not null references public.wallet_items on delete cascade,
  prompted_at    timestamptz not null default now(),
  responded_at   timestamptz,
  dismissed      boolean not null default false,
  primary key (user_id, wallet_item_id)
);

alter table public.morning_after_log enable row level security;
create policy "morning_after_log: owner only" on public.morning_after_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── trip_assemble RPC ──────────────────────────────────────────────────────
-- Cluster a user's flight/stay/ticket items into Trips. An item joins a trip
-- when its date range overlaps (within ±18h slack) with another already-in-trip
-- item. Called from the confirm-capture flow after a wallet_item insert.
create or replace function public.trip_assemble(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  slack interval := interval '18 hours';
  item record;
  matched_trip_id uuid;
  cluster_starts timestamptz;
  cluster_ends timestamptz;
begin
  if target_user <> auth.uid() then
    raise exception 'forbidden';
  end if;

  -- Walk this user's unassigned items in chronological order and cluster
  -- forward. A future item gets pulled into an open trip whose ends_at is
  -- within `slack` of the item's starts_at.
  for item in
    select w.id, w.starts_at, w.ends_at, w.kind, w.title
      from wallet_items w
     where w.user_id = target_user
       and w.trip_id is null
       and w.starts_at is not null
       and w.kind in ('flight', 'stay', 'ticket')
     order by w.starts_at asc
  loop
    matched_trip_id := null;

    -- Try to attach to an existing trip the item overlaps with.
    select t.id, t.starts_at, t.ends_at
      into matched_trip_id, cluster_starts, cluster_ends
      from trips t
     where t.user_id = target_user
       and t.auto_assembled = true
       and item.starts_at <= (t.ends_at + slack)
       and coalesce(item.ends_at, item.starts_at) >= (t.starts_at - slack)
     order by t.starts_at desc
     limit 1;

    if matched_trip_id is not null then
      -- Expand the trip's window to include this item.
      update trips
         set starts_at = least(starts_at, item.starts_at),
             ends_at = greatest(ends_at, coalesce(item.ends_at, item.starts_at + interval '4 hours'))
       where id = matched_trip_id;

      update wallet_items set trip_id = matched_trip_id where id = item.id;
    else
      -- Look ahead: does this item start a new cluster with anything close by?
      -- Only create a trip when at least one OTHER item in this user's set
      -- overlaps within slack — solo flights/stays don't deserve a trip.
      if exists (
        select 1 from wallet_items o
         where o.user_id = target_user
           and o.id <> item.id
           and o.starts_at is not null
           and o.starts_at between (item.starts_at - slack)
                              and (coalesce(item.ends_at, item.starts_at) + interval '7 days')
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
end;
$$;

grant execute on function public.trip_assemble(uuid) to authenticated;

-- ── throwbacks helper ──────────────────────────────────────────────────────
-- "On this day" — returns past experiences that share the current day-of-year.
create or replace function public.on_this_day(target_user uuid)
returns setof experiences
language sql
stable
security definer
set search_path = public
as $$
  select *
    from experiences
   where user_id = target_user
     and extract(month from starts_at) = extract(month from now())
     and extract(day from starts_at) = extract(day from now())
     and starts_at < now() - interval '6 months'
   order by starts_at desc
   limit 20;
$$;

grant execute on function public.on_this_day(uuid) to authenticated;
