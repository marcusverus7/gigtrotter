-- ─────────────────────────────────────────────────────────────────────────────
-- GigTrotter — Wishlist + alerts (§8.2)
--
-- Wishlists power the §9 affiliate surface — the offer attaches to declared
-- intent, not to ads. Alerts notify the user when something they're watching
-- goes on sale or drops in price.
-- ─────────────────────────────────────────────────────────────────────────────

create type wishlist_kind as enum ('artist', 'destination', 'venue', 'hotel');
create type alert_kind as enum ('on_sale', 'price_drop', 'tour_announce', 'friend_going');
create type alert_state as enum ('unread', 'read', 'dismissed');

-- ── wishlist ───────────────────────────────────────────────────────────────
-- Per-user wishlist items. `affiliate_partner` is the upstream we link to —
-- ticketmaster, dice, skyscanner, booking. URL is regenerated when shown.
create table public.wishlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  kind        wishlist_kind not null,
  name        text not null,
  subtitle    text,
  -- For artists/venues: setlist.fm id; for destinations: mapbox id; both null OK.
  external_id text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (user_id, kind, name)
);

create index wishlist_user_idx on public.wishlist (user_id, created_at desc);

alter table public.wishlist enable row level security;
create policy "wishlist: owner only" on public.wishlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── alerts ─────────────────────────────────────────────────────────────────
-- Surfaced events the user might care about. Created by background jobs
-- (tour-watcher, price-watcher) — those land in V1+; the table shape supports
-- them now so the UI is build-ready.
create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  wishlist_id     uuid references public.wishlist on delete cascade,
  kind            alert_kind not null,
  title           text not null,
  body            text,
  -- The CTA the user is being nudged toward. Partner+url drive the affiliate
  -- surface; on click the app appends our partner tags before redirecting.
  partner         text,
  url             text,
  event_at        timestamptz,
  state           alert_state not null default 'unread',
  created_at      timestamptz not null default now()
);

create index alerts_user_state_idx on public.alerts (user_id, state, created_at desc);

alter table public.alerts enable row level security;
create policy "alerts: owner only" on public.alerts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Convenience RPC: read all unread alerts in one go (used by the bell badge).
create or replace function public.unread_alert_count(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from alerts
   where user_id = target_user and state = 'unread';
$$;

grant execute on function public.unread_alert_count(uuid) to authenticated;
