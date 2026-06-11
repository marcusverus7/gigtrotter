-- ─────────────────────────────────────────────────────────────────────────────
-- GigTrotter — Event Discussions + Purple Tick
--
-- Every event gets a discussion space. Access tiers:
--   • purchased_via_platform = true  → full access (post, comment, react)
--     Gets the purple verified-purchase tick. Eligible for promos/badges.
--   • has wallet_item for this event  → view-only (can see posts but not
--     post or comment). No purple tick.
--   • no wallet_item                  → no access to discussion.
--
-- Promoters can send announcements to all ticket holders, powering the
-- "advertise your next gig to your existing audience" loop.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Add purchased_via_platform flag to wallet_items ──────────────────────
alter table public.wallet_items
  add column if not exists purchased_via_platform boolean not null default false;

-- ── discussion_posts ─────────────────────────────────────────────────────
-- A post in an event's discussion thread. Text and/or photos. Only users
-- with purchased_via_platform = true for this event can create posts.
create table public.discussion_posts (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events on delete cascade,
  author_id       uuid not null references auth.users on delete cascade,
  -- Content
  body            text,
  photos          text[] not null default '{}',
  -- Post type: 'post' for regular, 'photo_dump' for photo-only
  post_type       text not null default 'post',
  -- Counts (denormalised for perf)
  reaction_count  int not null default 0,
  reply_count     int not null default 0,
  -- Soft moderation
  is_hidden       boolean not null default false,
  -- Timestamps
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index discussion_posts_event_idx on public.discussion_posts (event_id, created_at desc);
create index discussion_posts_author_idx on public.discussion_posts (author_id);

alter table public.discussion_posts enable row level security;

-- Anyone with a wallet_item for this event can READ posts
create policy "discussion_posts: attendees read" on public.discussion_posts
  for select using (
    exists (
      select 1 from public.wallet_items wi
      join public.events e on (
        wi.title = e.title and wi.starts_at = e.starts_at
      )
      where e.id = event_id and wi.user_id = auth.uid()
    )
    or exists (
      select 1 from public.events e
      where e.id = event_id and e.promoter_id = auth.uid()
    )
  );

-- Only platform purchasers can CREATE posts
create policy "discussion_posts: purchasers create" on public.discussion_posts
  for insert with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.wallet_items wi
      join public.events e on (
        wi.title = e.title and wi.starts_at = e.starts_at
      )
      where e.id = event_id
        and wi.user_id = auth.uid()
        and wi.purchased_via_platform = true
    )
  );

-- Authors can update/delete their own posts
create policy "discussion_posts: author manages" on public.discussion_posts
  for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy "discussion_posts: author deletes" on public.discussion_posts
  for delete using (auth.uid() = author_id);

-- ── discussion_replies ───────────────────────────────────────────────────
create table public.discussion_replies (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.discussion_posts on delete cascade,
  author_id       uuid not null references auth.users on delete cascade,
  body            text not null,
  is_hidden       boolean not null default false,
  created_at      timestamptz not null default now()
);

create index discussion_replies_post_idx on public.discussion_replies (post_id, created_at);

alter table public.discussion_replies enable row level security;

create policy "discussion_replies: attendees read" on public.discussion_replies
  for select using (
    exists (
      select 1 from public.discussion_posts dp
      join public.events e on e.id = dp.event_id
      join public.wallet_items wi on (wi.title = e.title and wi.starts_at = e.starts_at)
      where dp.id = post_id and wi.user_id = auth.uid()
    )
    or exists (
      select 1 from public.discussion_posts dp
      join public.events e on e.id = dp.event_id
      where dp.id = post_id and e.promoter_id = auth.uid()
    )
  );

create policy "discussion_replies: purchasers create" on public.discussion_replies
  for insert with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.discussion_posts dp
      join public.events e on e.id = dp.event_id
      join public.wallet_items wi on (wi.title = e.title and wi.starts_at = e.starts_at)
      where dp.id = post_id
        and wi.user_id = auth.uid()
        and wi.purchased_via_platform = true
    )
  );

create policy "discussion_replies: author deletes" on public.discussion_replies
  for delete using (auth.uid() = author_id);

-- ── discussion_reactions ─────────────────────────────────────────────────
create table public.discussion_reactions (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.discussion_posts on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  reaction        text not null default 'fire',  -- fire, heart, clap, camera
  created_at      timestamptz not null default now(),
  unique (post_id, user_id)
);

create index discussion_reactions_post_idx on public.discussion_reactions (post_id);

alter table public.discussion_reactions enable row level security;

create policy "discussion_reactions: attendees read" on public.discussion_reactions
  for select using (true);

create policy "discussion_reactions: purchasers create" on public.discussion_reactions
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.discussion_posts dp
      join public.events e on e.id = dp.event_id
      join public.wallet_items wi on (wi.title = e.title and wi.starts_at = e.starts_at)
      where dp.id = post_id
        and wi.user_id = auth.uid()
        and wi.purchased_via_platform = true
    )
  );

create policy "discussion_reactions: user deletes own" on public.discussion_reactions
  for delete using (auth.uid() = user_id);

-- ── promoter_announcements ───────────────────────────────────────────────
-- Promoter broadcasts to all ticket holders for an event. Powers the
-- "advertise next gig" and "exclusive offer" loop.
create table public.promoter_announcements (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events on delete cascade,
  promoter_id     uuid not null references auth.users on delete cascade,
  -- Content
  title           text not null,
  body            text not null,
  -- Optional CTA link (e.g. next gig, merch drop, discount code)
  cta_label       text,             -- "Get tickets", "Shop merch", "Claim discount"
  cta_url         text,
  -- Whether this is pinned at the top of the discussion
  is_pinned       boolean not null default false,
  created_at      timestamptz not null default now()
);

create index promoter_announcements_event_idx on public.promoter_announcements (event_id, created_at desc);

alter table public.promoter_announcements enable row level security;

-- Anyone with a wallet_item can read announcements
create policy "promoter_announcements: attendees read" on public.promoter_announcements
  for select using (
    exists (
      select 1 from public.wallet_items wi
      join public.events e on (wi.title = e.title and wi.starts_at = e.starts_at)
      where e.id = event_id and wi.user_id = auth.uid()
    )
    or auth.uid() = promoter_id
  );

-- Only the event's promoter can create/manage announcements
create policy "promoter_announcements: promoter creates" on public.promoter_announcements
  for insert with check (
    auth.uid() = promoter_id
    and exists (
      select 1 from public.events where id = event_id and promoter_id = auth.uid()
    )
  );

create policy "promoter_announcements: promoter manages" on public.promoter_announcements
  for update using (auth.uid() = promoter_id) with check (auth.uid() = promoter_id);

create policy "promoter_announcements: promoter deletes" on public.promoter_announcements
  for delete using (auth.uid() = promoter_id);

-- ── purchase_perks ───────────────────────────────────────────────────────
-- Track perks/rewards earned through platform purchases. Powers the
-- "higher chance to win stuff" and reputation system.
create table public.purchase_perks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  event_id        uuid references public.events on delete set null,
  perk_type       text not null,      -- 'badge', 'discount', 'prize_entry', 'early_access'
  label           text not null,       -- "Early bird badge", "10% off merch"
  description     text,
  -- Discount specifics
  discount_code   text,
  discount_pct    int,
  -- Expiry
  expires_at      timestamptz,
  redeemed_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index purchase_perks_user_idx on public.purchase_perks (user_id);

alter table public.purchase_perks enable row level security;
create policy "purchase_perks: user reads own" on public.purchase_perks
  for select using (auth.uid() = user_id);
