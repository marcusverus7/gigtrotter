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

-- Verify (as anon, via PostgREST):
--   GET /rest/v1/profiles?select=username,anon_handle&limit=1   -- 42501 permission denied
--   GET /rest/v1/profiles?select=username&limit=1               -- 200
-- As a signed-in user: POST /rest/v1/rpc/my_profile_private      -- own row only
