-- Authorisation holes in SECURITY DEFINER RPCs and two over-broad policies
--
-- SECURITY DEFINER functions run with the definer's rights, so RLS does not
-- apply inside them. That is the point — but it means the function itself has
-- to do the authorisation the policies would otherwise have done. Four of ours
-- took a `target_user uuid` straight from the caller and never compared it to
-- `auth.uid()`.
--
-- `trip_assemble` in the same migration file as `on_this_day` does this
-- correctly: `if target_user <> auth.uid() then raise exception 'forbidden'`.
-- The others simply did not, so any authenticated caller could pass somebody
-- else's id. Profile ids are trivially enumerable (`profiles` is readable by
-- everyone), so this was not a theoretical hole.
--
-- Worst of the four: `on_this_day` returns `setof experiences` — whole rows,
-- including `audience = 'vault'` pins, future pins, ratings, reviews and
-- photos. It defeated the entire time-shift rule in one call.
--
-- All four are self-only features by design, so the fix is a guard, not a
-- redesign of what they return.

-- ── on_this_day ────────────────────────────────────────────────────────────
create or replace function public.on_this_day(target_user uuid)
returns setof experiences
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if target_user is distinct from auth.uid() then
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

-- ── who_else_going ─────────────────────────────────────────────────────────
-- Wrap the existing body rather than restate it: the original stays the source
-- of truth for the join logic, and this only adds the caller check. Renaming
-- the inner function keeps the public entry point at the same name and grant.
do $$
begin
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'who_else_going_unguarded'
  ) then
    alter function public.who_else_going(uuid) rename to who_else_going_unguarded;
  end if;
end
$$;

revoke all on function public.who_else_going_unguarded(uuid) from public, anon, authenticated;

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
  if target_user is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  return query select * from public.who_else_going_unguarded(target_user);
end;
$$;

grant execute on function public.who_else_going(uuid) to authenticated;

-- ── unread_alert_count ─────────────────────────────────────────────────────
-- Leaks far less than the two above — a single integer — but there is no
-- reason for it to answer questions about another account. (`is_plus` has the
-- same missing guard and is left alone: it is currently called from nowhere,
-- and it only reports a column that `profiles: read all` already exposes.)
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
  if target_user is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  select count(*)::integer into n
    from public.alerts
   where user_id = target_user and state = 'unread';

  return coalesce(n, 0);
end;
$$;

-- ── events: a promoter could approve their own submission ──────────────────
-- `events: promoter manages own` was `for all`, so a promoter could PATCH
-- their own row's `status` to 'approved' and skip review entirely. Migration
-- 0011's header claims a user "can no longer publish an event without review";
-- the policy it left in place said otherwise.
--
-- Moderation runs through `setEventModerationStatus`, which uses the service
-- client, so revoking the column from `authenticated` costs the admin path
-- nothing. The insert check pins new submissions to 'pending' so a promoter
-- cannot arrive pre-approved either.
revoke update (status) on public.events from authenticated, anon;

drop policy if exists "events: promoter manages own" on public.events;

create policy "events: promoter reads own" on public.events
  for select using (auth.uid() = promoter_id);
create policy "events: promoter submits" on public.events
  for insert with check (auth.uid() = promoter_id and status = 'pending');
create policy "events: promoter edits own" on public.events
  for update using (auth.uid() = promoter_id)
  with check (auth.uid() = promoter_id);
create policy "events: promoter deletes own" on public.events
  for delete using (auth.uid() = promoter_id);

-- ── profiles: a user could grant themselves Plus ───────────────────────────
-- `profiles: update self` covers every column, `plan` included, so
-- `PATCH /profiles?id=eq.<self>` with `{"plan":"plus"}` defeated `is_plus()`
-- and every paid gate. Nothing in the app writes `plan` from a session client
-- (subscription state is server-side), so a column revoke is enough and needs
-- no code change. anon_handle is deliberately NOT revoked — regenerating the
-- board link is a real user action that runs on the session client.
revoke update (plan) on public.profiles from authenticated, anon;
