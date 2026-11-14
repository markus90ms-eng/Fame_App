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


-- Kauf-Nachweise (Beweise für Streitfälle): ein Eintrag je Kauf, bevor die Card ausgestellt wird.
-- Die CHECK-Regeln lehnen jeden Kauf ab, bei dem ein Pflicht-Häkchen fehlt (AGB, Alter ab 18,
-- sofortige Ausstellung mit Verzicht aufs Widerrufsrecht). Zeitpunkt created_at kommt vom Server.
-- Einträge können vom Nutzer weder geändert noch gelöscht werden.
create table if not exists public.purchase_evidence (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  serial text not null check (char_length(serial) between 4 and 40),
  amount numeric(12, 2) not null check (amount >= 1 and amount <= 1000000),
  legal_version text not null check (char_length(legal_version) <= 20),
  agb_accepted boolean not null check (agb_accepted),
  adult_confirmed boolean not null check (adult_confirmed),
  waiver_accepted boolean not null check (waiver_accepted),
  client_at timestamptz,
  user_agent text check (user_agent is null or char_length(user_agent) <= 300)
);

-- Keine Ausweisprüfung: frühere Spalte id_check entfernen, falls sie schon angelegt wurde
alter table public.purchase_evidence drop column if exists id_check;

alter table public.purchase_evidence enable row level security;

drop policy if exists "Kauf-Nachweis anlegen" on public.purchase_evidence;
drop policy if exists "Kauf-Nachweis lesen" on public.purchase_evidence;

create policy "Kauf-Nachweis anlegen" on public.purchase_evidence
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Kauf-Nachweis lesen" on public.purchase_evidence
  for select to authenticated using (user_id = (select auth.uid()));

grant select, insert on public.purchase_evidence to authenticated;


-- Kasse (Stripe Checkout): eine Zeile je Bestellung. Angelegt und geändert wird sie nur von den
-- Edge Functions "checkout" und "stripe-webhook" (Service-Rolle). Die Card ist erst ausgestellt,
-- wenn Stripe die Zahlung bestätigt hat: dann setzt der Webhook status = 'paid' und vergibt die
-- Seriennummer. Nutzer dürfen ihre eigenen Bestellungen nur lesen.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 1 and amount <= 999999),
  currency text not null default 'eur' check (currency = 'eur'),
  status text not null default 'open' check (status in ('open', 'paid', 'failed', 'expired')),
  stripe_session text unique,
  payment_intent text,
  serial text unique check (serial is null or serial ~ '^FM-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]$'),
  paid_at timestamptz
);

create index if not exists orders_user_idx on public.orders (user_id, created_at desc);

alter table public.orders enable row level security;

drop policy if exists "Bestellung lesen" on public.orders;
create policy "Bestellung lesen" on public.orders
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.orders from anon, authenticated;
grant select on public.orders to authenticated;

-- Kauf-Nachweis gehört zur Bestellung (wird von der Funktion "checkout" angelegt)
alter table public.purchase_evidence add column if not exists order_id uuid references public.orders (id) on delete set null;
