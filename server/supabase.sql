-- Fam€: Tabelle für die Profile (einmal im Supabase-Dashboard unter „SQL Editor“ ausführen).
-- Eine Zeile je Nutzer: verbundene Accounts, Ranking-Einstellungen und Cards als JSON.
-- Lesen und ändern darf jeder nur seine eigene Zeile (Row Level Security).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profil lesen" on public.profiles;
drop policy if exists "Profil anlegen" on public.profiles;
drop policy if exists "Profil ändern" on public.profiles;

create policy "Profil lesen" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "Profil anlegen" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

create policy "Profil ändern" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

grant select, insert, update on public.profiles to authenticated;
