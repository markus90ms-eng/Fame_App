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


-- Online-Widerruf (§ 356a BGB, „Vertrag widerrufen“ in der App).
-- Jeder darf eine Erklärung abgeben – auch ohne Login. Lesen kann sie nur der Betreiber im Dashboard.
create table if not exists public.withdrawals (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  contract text not null check (char_length(contract) between 1 and 80),
  email text not null check (char_length(email) between 3 and 200),
  note text check (note is null or char_length(note) <= 1000)
);

alter table public.withdrawals enable row level security;

drop policy if exists "Widerruf abgeben" on public.withdrawals;

create policy "Widerruf abgeben" on public.withdrawals
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

grant insert on public.withdrawals to anon, authenticated;
