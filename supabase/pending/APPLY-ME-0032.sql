-- ─────────────────────────────────────────────────────────────────────────────
-- 0032 — atomic capture budget (CAP-01)
--
-- The capture quota used to be "count today's captures rows, then proceed".
-- The row is inserted AFTER the vision call, so N requests arriving together
-- all see the same count and all go to the model: a burst of 50 at 99/100
-- overshoots to 149, and the overshoot is real money (one vision call each).
--
-- This table is the budget itself. A slot is taken with ONE statement
-- (insert … on conflict do update … where used < limit), which serialises on
-- the row lock, so concurrent callers see each other's increments and exactly
-- `limit` of them succeed. A slot is taken BEFORE any storage or model work
-- and given back on the paths that cost nothing (pending-card twin,
-- fingerprint-cache hit, upload failure); a model call consumes it whether or
-- not the parse succeeds.
--
-- Two rows matter per day: the user's own, and a platform-wide row keyed by
-- the nil uuid that caps the whole day's spend whatever the user mix.
--
-- Service-role only. No client policy; the functions are revoked from anon
-- and authenticated exactly like reserve_tier (0029). Days are UTC.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.capture_budget (
  user_id    uuid not null,
  day        date not null,
  used       integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.capture_budget enable row level security;
-- No policies on purpose: nothing a client needs to read or write here.
revoke all on table public.capture_budget from anon, authenticated;

-- Take one slot for `target_user` today if fewer than `daily_limit` are used.
-- Returns true when the slot was taken. Atomic: the ON CONFLICT path locks the
-- row and re-reads `used` under that lock, so parallel callers cannot overshoot.
create or replace function public.reserve_capture_slot(target_user uuid, daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  taken boolean;
begin
  if daily_limit is null or daily_limit <= 0 then
    return false;
  end if;

  insert into public.capture_budget (user_id, day, used)
  values (target_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set used = capture_budget.used + 1,
        updated_at = now()
    where capture_budget.used < daily_limit
  returning true into taken;

  return coalesce(taken, false);
end;
$$;

-- Give a slot back (a path that turned out to cost nothing). Floors at zero.
-- If the UTC day rolled over between reserve and release there is no row to
-- decrement; that slot is simply lost, which errs on the safe side.
create or replace function public.release_capture_slot(target_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.capture_budget
     set used = greatest(0, used - 1),
         updated_at = now()
   where user_id = target_user
     and day = (now() at time zone 'utc')::date;
$$;

revoke all on function public.reserve_capture_slot(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_capture_slot(uuid) from public, anon, authenticated;

-- Verify:
--   select proname from pg_proc where proname in ('reserve_capture_slot', 'release_capture_slot');
--   select public.reserve_capture_slot('00000000-0000-0000-0000-000000000000', 1);  -- true (as service role)
--   select public.reserve_capture_slot('00000000-0000-0000-0000-000000000000', 1);  -- false
--   select public.release_capture_slot('00000000-0000-0000-0000-000000000000');
--   delete from public.capture_budget where user_id = '00000000-0000-0000-0000-000000000000';
