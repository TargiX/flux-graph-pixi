create table if not exists public.roomboard_rooms (
  id text primary key,
  document jsonb not null,
  closed_at bigint,
  updated_at timestamptz not null default now()
);

create index if not exists roomboard_rooms_open_updated_idx
  on public.roomboard_rooms (closed_at, updated_at desc);

alter table public.roomboard_rooms enable row level security;

drop policy if exists "Roomboard public document access" on public.roomboard_rooms;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'roomboard-uploads',
  'roomboard-uploads',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Roomboard public upload'
  ) then
    create policy "Roomboard public upload"
      on storage.objects
      for insert
      to public
      with check (bucket_id = 'roomboard-uploads');
  end if;
end
$$;

drop policy if exists "Roomboard public read" on storage.objects;
