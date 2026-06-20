create extension if not exists pgcrypto;

create table if not exists public.roomboard_rooms (
  id text primary key,
  owner_id uuid references auth.users (id) on delete set null,
  document jsonb not null,
  closed_at bigint,
  updated_at timestamptz not null default now()
);

alter table public.roomboard_rooms
  add column if not exists owner_id uuid references auth.users (id) on delete set null;

create index if not exists roomboard_rooms_open_updated_idx
  on public.roomboard_rooms (closed_at, updated_at desc);

create index if not exists roomboard_rooms_owner_updated_idx
  on public.roomboard_rooms (owner_id, updated_at desc);

alter table public.roomboard_rooms enable row level security;

drop policy if exists "Roomboard public document access" on public.roomboard_rooms;
drop policy if exists "Roomboard owners can read rooms" on public.roomboard_rooms;
drop policy if exists "Roomboard owners can insert rooms" on public.roomboard_rooms;
drop policy if exists "Roomboard owners can update rooms" on public.roomboard_rooms;

create policy "Roomboard owners can read rooms"
  on public.roomboard_rooms
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy "Roomboard owners can insert rooms"
  on public.roomboard_rooms
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "Roomboard owners can update rooms"
  on public.roomboard_rooms
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create table if not exists public.roomboard_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.roomboard_profiles enable row level security;

drop policy if exists "Profiles are readable by owner" on public.roomboard_profiles;
drop policy if exists "Profiles are insertable by owner" on public.roomboard_profiles;
drop policy if exists "Profiles are updateable by owner" on public.roomboard_profiles;

create policy "Profiles are readable by owner"
  on public.roomboard_profiles
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Profiles are insertable by owner"
  on public.roomboard_profiles
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Profiles are updateable by owner"
  on public.roomboard_profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  plan_id text,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_subscriptions_user_updated_idx
  on public.billing_subscriptions (user_id, updated_at desc);

alter table public.billing_subscriptions enable row level security;

drop policy if exists "Subscriptions are readable by owner" on public.billing_subscriptions;

create policy "Subscriptions are readable by owner"
  on public.billing_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'roomboard-uploads',
  'roomboard-uploads',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Roomboard public upload" on storage.objects;
drop policy if exists "Roomboard public read" on storage.objects;
