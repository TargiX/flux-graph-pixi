create table if not exists public.roomboard_rooms (
  id text primary key,
  document jsonb not null,
  closed_at bigint,
  updated_at timestamptz not null default now()
);

create index if not exists roomboard_rooms_open_updated_idx
  on public.roomboard_rooms (closed_at, updated_at desc);
