-- ─────────────────────────────────────────────────────────────────────────────
-- 0033 — the anonymous board is de-anonymisable through profiles
--
-- Found by an anonymous-key sweep of production on 2026-11-02 after 0031 was
-- written. `profiles: read all` grants every column to anon and authenticated,
-- and the columns include `anon_handle` — which IS the /b/<handle> URL of a
-- person's "anonymous" board — next to `username`. One request,
--   GET /rest/v1/profiles?anon_handle=eq.<handle>&select=username
-- names the owner of any board. `anon_hash`, `plan` (GigTrotter+ status),
-- `anon_views` and `last_alert_scan_at` leaked the same way.
--
-- Fix: table-level SELECT is withdrawn from the client roles and re-granted
-- on the public columns only (a column REVOKE on its own is a no-op while
-- the table grant stands — the lesson from 0020). The owner reads their own
-- private fields through my_profile_private(), which runs as the definer and
-- answers only for auth.uid(). Service-role paths (inbound email, /b page,
-- anon_board RPC) are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

revoke select on public.profiles from anon, authenticated;
grant select (id, username, display_name, avatar_url, created_at, updated_at)
  on public.profiles to anon, authenticated;

create or replace function public.my_profile_private()
returns table (
  anon_handle        text,
  anon_hash          text,
  anon_revoked       boolean,
  anon_views         integer,
  plan               text,
  last_alert_scan_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.anon_handle, p.anon_hash, p.anon_revoked, p.anon_views, p.plan, p.last_alert_scan_at
    from public.profiles p
   where auth.uid() is not null and p.id = auth.uid();
$$;
revoke all on function public.my_profile_private() from public, anon;
grant execute on function public.my_profile_private() to authenticated, service_role;


-- ═══ RPC sweep (same day): relationship oracle and an anonymous write ═════
--
-- Probing every function as the anonymous key showed are_friends(u1, u2) and
-- in_inner_circle(owner, member) executable by anyone: a relationship oracle
-- over the enumerable profile ids. Every legitimate caller (the RLS policies
-- in 0002/0026/0031 and who_else_going) passes auth.uid() as one of the two
-- ids, so the guard below costs them nothing and answers false to everyone
-- else — false, not an error, so policy evaluation never trips on it.
-- bump_anon_view was executable by anon (anyone could inflate a board's
-- views) although only the /b page's service client calls it, and is_plus
-- reads the now-private plan column and is called from nowhere.

create or replace function public.are_friends(u1 uuid, u2 uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and auth.uid() in (u1, u2)
     and exists (
       select 1
         from public.friendships f
        where f.state = 'accepted'
          and f.user_a = least(u1, u2) and f.user_b = greatest(u1, u2)
     );
$$;

create or replace function public.in_inner_circle(owner uuid, member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and auth.uid() in (owner, member)
     and exists (
       select 1
         from public.circles c
         join public.circle_members m on m.circle_id = c.id
        where c.user_id = owner
          and c.kind = 'inner'
          and m.member_id = member
     );
$$;

revoke all on function public.bump_anon_view(text) from public, anon, authenticated;
grant execute on function public.bump_anon_view(text) to service_role;

revoke all on function public.is_plus(uuid) from public, anon, authenticated;
grant execute on function public.is_plus(uuid) to service_role;

-- Verify (as anon): POST /rest/v1/rpc/are_friends {"u1":"<a>","u2":"<b>"} -> false even for friends
--                   POST /rest/v1/rpc/bump_anon_view {"handle":"x"}        -> 42501


-- ═══ PAY-01/02: transfers and guest-list tickets in one transaction ═══════
--
-- transferTicket voided the old ticket, archived its wallet item and then
-- inserted the new wallet item and ticket as four separate statements; a
-- failure after the first left the holder with no valid ticket at all.
-- issueCompTicket wrote the wallet item before the ticket row. Both now run
-- inside one function: all or nothing, with the ticket row locked so two
-- concurrent transfers (or a transfer racing a resale listing) cannot both
-- succeed. Service-role only, like fulfil_order_tx.

create or replace function public.issue_ticket_tx(
  target_event uuid, target_tier uuid, new_owner uuid, new_code text,
  issued_as text, from_user uuid, for_order uuid, wallet_status text, note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
  tier_name text;
  w uuid;
  t uuid;
  m jsonb;
begin
  select id, title, venue_id, venue_name, venue_city, starts_at, ends_at
    into ev from public.events where id = target_event;
  if not found then raise exception 'event % missing', target_event; end if;
  select name into tier_name from public.ticket_tiers where id = target_tier and event_id = target_event;
  if not found then raise exception 'tier % is not on event %', target_tier, target_event; end if;

  m := jsonb_build_object(
    'audience', 'inner', 'vendor', 'gigtrotter', 'gigtrotter_ticket_code', new_code,
    'tier', tier_name, 'event_id', ev.id
  );
  if for_order is not null then m := m || jsonb_build_object('order_id', for_order); end if;
  if from_user is not null then m := m || jsonb_build_object('transferred_from', from_user); end if;
  if note is not null then m := m || jsonb_build_object('comp', note); end if;

  insert into public.wallet_items (user_id, kind, status, title, subtitle, venue_id, starts_at, ends_at, purchased_via_platform, meta)
  values (
    new_owner, 'ticket', wallet_status::wallet_status, ev.title,
    nullif(concat_ws(' · ', tier_name, ev.venue_name, ev.venue_city), ''),
    ev.venue_id, ev.starts_at, ev.ends_at, true, m
  )
  returning id into w;

  insert into public.tickets (order_id, event_id, tier_id, owner_id, wallet_item_id, code, issued_as, transferred_from)
  values (for_order, ev.id, target_tier, new_owner, w, new_code, issued_as, from_user)
  returning id into t;

  return jsonb_build_object('ticket_id', t, 'wallet_item_id', w);
end;
$$;
revoke all on function public.issue_ticket_tx(uuid, uuid, uuid, text, text, uuid, uuid, text, text) from public, anon, authenticated;

create or replace function public.transfer_ticket_tx(
  target_ticket uuid, current_owner uuid, new_owner uuid, new_code text, wallet_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  old record;
  issued jsonb;
begin
  select * into old from public.tickets where id = target_ticket and owner_id = current_owner for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if old.status <> 'valid' then return jsonb_build_object('error', 'not_valid', 'status', old.status::text); end if;
  if new_owner = current_owner then return jsonb_build_object('error', 'self'); end if;
  if exists (select 1 from public.ticket_listings l where l.ticket_id = old.id and l.status in ('open', 'reserved')) then
    return jsonb_build_object('error', 'listed');
  end if;
  if exists (select 1 from public.events e where e.id = old.event_id and e.starts_at is not null and e.starts_at < now()) then
    return jsonb_build_object('error', 'started');
  end if;

  update public.tickets set status = 'transferred' where id = old.id;
  if old.wallet_item_id is not null then
    update public.wallet_items set status = 'archived' where id = old.wallet_item_id;
  end if;
  issued := public.issue_ticket_tx(old.event_id, old.tier_id, new_owner, new_code, 'transfer', current_owner, null, wallet_status);
  return issued || jsonb_build_object('voided', old.id);
end;
$$;
revoke all on function public.transfer_ticket_tx(uuid, uuid, uuid, text, text) from public, anon, authenticated;

-- Verify: select proname from pg_proc where proname in ('issue_ticket_tx','transfer_ticket_tx');

-- Verify (as anon, via PostgREST):
--   GET /rest/v1/profiles?select=username,anon_handle&limit=1   -- 42501 permission denied
--   GET /rest/v1/profiles?select=username&limit=1               -- 200
-- As a signed-in user: POST /rest/v1/rpc/my_profile_private      -- own row only
