-- Make the plan / status column protections actually take effect
--
-- Migration 0015 tried to stop a user granting themselves Plus, and a promoter
-- approving their own event, with:
--
--   revoke update (plan)   on public.profiles from authenticated, anon;
--   revoke update (status) on public.events   from authenticated, anon;
--
-- Those were silent no-ops. Supabase grants `authenticated` and `anon`
-- table-level UPDATE on every table in `public` and relies on RLS for row
-- filtering — and PostgreSQL does not allow a column-level REVOKE to carve an
-- exception out of a table-wide grant. The statements ran without error, the
-- privilege stayed exactly as it was, and verifying the migration by checking
-- that the functions existed would never have caught it. Only reading
-- information_schema.column_privileges afterwards did.
--
-- The supported way to get column-scoped UPDATE is to drop the table-level
-- grant and re-grant every column EXCEPT the protected one. The column list is
-- built from the catalogue rather than typed out, so a column added later is
-- included automatically instead of silently becoming read-only.

do $$
declare
  cols text;
begin
  -- ── profiles: everything except `plan` ──────────────────────────────────
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'profiles'
     and column_name <> 'plan';

  revoke update on public.profiles from authenticated, anon;
  execute format('grant update (%s) on public.profiles to authenticated', cols);
  execute format('grant update (%s) on public.profiles to anon', cols);

  -- ── events: everything except `status` ──────────────────────────────────
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'events'
     and column_name <> 'status';

  revoke update on public.events from authenticated, anon;
  execute format('grant update (%s) on public.events to authenticated', cols);
  execute format('grant update (%s) on public.events to anon', cols);
end
$$;

-- Moderation still works: setEventModerationStatus uses the service client,
-- and service_role is unaffected by any of the above.
