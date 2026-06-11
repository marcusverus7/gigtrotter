-- ─────────────────────────────────────────────────────────────────────────────
-- GigTrotter — Phase 1 schema
-- profiles, circles, friendships, anonymous_boards
--
-- RLS-first. Every table has policies. The time-shift rule (future events
-- never visible beyond Inner Circle) lands in migration 0002 with experiences.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── enums ──────────────────────────────────────────────────────────────────
create type audience as enum ('vault', 'inner', 'friends', 'open');
create type circle_kind as enum ('inner', 'custom');
create type friendship_state as enum ('pending', 'accepted', 'blocked');

-- ── profiles ───────────────────────────────────────────────────────────────
-- One row per auth.users user. Anon handle is generated at signup and the
-- public board lives at /b/<anon_handle>. Username is the bilateral friend key.
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  username     text unique not null check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text,
  avatar_url   text,
  -- Anonymous identity layer (§3.2). Hash is what the URL exposes.
  anon_handle  text unique not null check (anon_handle ~ '^[a-z0-9-]{8,40}$'),
  anon_hash    text unique not null,
  anon_revoked boolean not null default false,
  anon_views   integer not null default 0,
  -- Premium tier — schema-ready, never paywalls capture.
  plan         text not null default 'free' check (plan in ('free', 'plus')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index profiles_username_idx on public.profiles (username);
create index profiles_anon_hash_idx on public.profiles (anon_hash) where not anon_revoked;

alter table public.profiles enable row level security;

-- Everyone can read public-facing profile fields (the friend-lookup surface).
-- We rely on view-level masking for non-public fields rather than column RLS.
create policy "profiles: read all" on public.profiles
  for select using (true);

create policy "profiles: insert self" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles: update self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ── circles ────────────────────────────────────────────────────────────────
-- Every user has an auto-created 'inner' circle (kind = 'inner'). Members are
-- a hand-picked list. Custom circles are V1+ but the table shape supports them.
create table public.circles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  kind       circle_kind not null default 'custom',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index circles_user_idx on public.circles (user_id);

alter table public.circles enable row level security;

create policy "circles: owner only" on public.circles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.circle_members (
  circle_id  uuid not null references public.circles on delete cascade,
  member_id  uuid not null references auth.users on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (circle_id, member_id)
);

alter table public.circle_members enable row level security;

-- The circle owner can manage members. Members can see they are in it.
create policy "circle_members: owner reads/writes" on public.circle_members
  for all using (
    exists (
      select 1 from public.circles c
       where c.id = circle_members.circle_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.circles c
       where c.id = circle_members.circle_id and c.user_id = auth.uid()
    )
  );

create policy "circle_members: members read self rows" on public.circle_members
  for select using (member_id = auth.uid());

-- ── friendships ────────────────────────────────────────────────────────────
-- Bilateral. Stored as one row with (a, b) where a < b for uniqueness.
-- State transitions: pending → accepted | (deleted by either side).
create table public.friendships (
  id          uuid primary key default gen_random_uuid(),
  user_a      uuid not null references auth.users on delete cascade,
  user_b      uuid not null references auth.users on delete cascade,
  requested_by uuid not null references auth.users on delete cascade,
  state       friendship_state not null default 'pending',
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  check (user_a < user_b),
  unique (user_a, user_b)
);

create index friendships_a_idx on public.friendships (user_a);
create index friendships_b_idx on public.friendships (user_b);

alter table public.friendships enable row level security;

create policy "friendships: read own" on public.friendships
  for select using (auth.uid() in (user_a, user_b));

create policy "friendships: request" on public.friendships
  for insert with check (
    auth.uid() = requested_by and auth.uid() in (user_a, user_b)
  );

create policy "friendships: update own" on public.friendships
  for update using (auth.uid() in (user_a, user_b))
  with check (auth.uid() in (user_a, user_b));

create policy "friendships: delete own" on public.friendships
  for delete using (auth.uid() in (user_a, user_b));

-- Helper: are these two users accepted friends?
create or replace function public.are_friends(u1 uuid, u2 uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.friendships f
     where f.state = 'accepted'
       and (
         (f.user_a = least(u1, u2) and f.user_b = greatest(u1, u2))
       )
  );
$$;

-- Helper: is `member` in `owner`'s inner circle?
create or replace function public.in_inner_circle(owner uuid, member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.circles c
      join public.circle_members m on m.circle_id = c.id
     where c.user_id = owner
       and c.kind = 'inner'
       and m.member_id = member
  );
$$;

-- ── signup trigger ─────────────────────────────────────────────────────────
-- Creates a profile + auto 'inner' circle on signup. The anon handle is a
-- pronounceable adjective-noun-NNN slug — 13M combinations.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  adjectives text[] := array[
    'midnight','crimson','silver','golden','velvet','copper','sapphire','emerald',
    'amber','indigo','quiet','wild','northern','southern','electric','lunar',
    'solar','tidal','swift','restless','radiant','obsidian','ivory','glacial',
    'verdant','scarlet','azure','cobalt','dawn','dusk'
  ];
  nouns text[] := array[
    'fox','wolf','heron','otter','panther','falcon','crane','sparrow',
    'leopard','badger','dolphin','raven','owl','hare','lynx','stag',
    'kestrel','viper','marten','swan','jaguar','tiger','ibis','phoenix',
    'kraken','dragon','manta','seal','puffin','swallow'
  ];
  handle text;
  attempts int := 0;
begin
  loop
    handle :=
      adjectives[1 + floor(random() * array_length(adjectives, 1))::int] ||
      '-' ||
      nouns[1 + floor(random() * array_length(nouns, 1))::int] ||
      '-' ||
      lpad((floor(random() * 1000))::text, 3, '0');
    exit when not exists (select 1 from public.profiles where anon_handle = handle);
    attempts := attempts + 1;
    if attempts > 8 then
      handle := handle || '-' || substr(md5(new.id::text), 1, 4);
      exit;
    end if;
  end loop;

  insert into public.profiles (id, username, display_name, anon_handle, anon_hash)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      'user_' || substr(replace(new.id::text, '-', ''), 1, 12)
    ),
    new.raw_user_meta_data->>'display_name',
    handle,
    encode(extensions.digest(handle || new.id::text, 'sha256'), 'hex')
  );

  -- Every account gets an Inner Circle by default.
  insert into public.circles (user_id, name, kind)
  values (new.id, 'Inner Circle', 'inner');

  return new;
end;
$$;

-- pgcrypto provides digest() in extensions schema on Supabase
create extension if not exists "pgcrypto" with schema "extensions";

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── updated_at trigger ─────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();
