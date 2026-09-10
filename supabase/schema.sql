-- DDAM CUP shared tournament state
-- Run this once in Supabase Dashboard → SQL Editor.

create table if not exists public.tournaments (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated timestamptz not null default now()
);

grant select, insert, update on table public.tournaments to anon, authenticated;

alter table public.tournaments enable row level security;

drop policy if exists "Public can read tournament state" on public.tournaments;
create policy "Public can read tournament state"
  on public.tournaments
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public can insert tournament state" on public.tournaments;
create policy "Public can insert tournament state"
  on public.tournaments
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Public can update tournament state" on public.tournaments;
create policy "Public can update tournament state"
  on public.tournaments
  for update
  to anon, authenticated
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tournaments'
  ) then
    execute 'alter publication supabase_realtime add table public.tournaments';
  end if;
end
$$;
