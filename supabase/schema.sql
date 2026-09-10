-- DDAM CUP shared tournament state
-- Run this in Supabase Dashboard → SQL Editor.
--
-- The board is publicly readable, but only a user listed in
-- public.tournament_admins can insert or update tournament state.

create table if not exists public.tournaments (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated timestamptz not null default now()
);

create table if not exists public.tournament_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;
alter table public.tournament_admins enable row level security;

-- This function is used only by RLS policies. It does not expose the admin
-- table to the browser.
create or replace function public.is_tournament_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tournament_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_tournament_admin() from public;
grant execute on function public.is_tournament_admin() to anon, authenticated;

-- Visitors can read the live board. Only authenticated admin users can write.
revoke insert, update, delete on table public.tournaments from anon;
grant select on table public.tournaments to anon, authenticated;
grant insert, update on table public.tournaments to authenticated;

drop policy if exists "Public can read tournament state" on public.tournaments;
create policy "Public can read tournament state"
  on public.tournaments
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public can insert tournament state" on public.tournaments;
drop policy if exists "Public can update tournament state" on public.tournaments;
drop policy if exists "Tournament admins can insert state" on public.tournaments;
drop policy if exists "Tournament admins can update state" on public.tournaments;

create policy "Tournament admins can insert state"
  on public.tournaments
  for insert
  to authenticated
  with check (public.is_tournament_admin());

create policy "Tournament admins can update state"
  on public.tournaments
  for update
  to authenticated
  using (public.is_tournament_admin())
  with check (public.is_tournament_admin());

-- Do not grant browser access to the admin membership table.
revoke all on table public.tournament_admins from anon, authenticated;

-- After creating your one admin user in Authentication → Users, run this
-- once with that user's UUID:
-- insert into public.tournament_admins (user_id)
-- values ('PASTE-YOUR-AUTH-USER-UUID-HERE')
-- on conflict (user_id) do nothing;

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
