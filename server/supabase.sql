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


-- ===== Echte Zahlung: Rückbuchung (z5), Beweise (z12), E-Mails (z6) =====

-- Bestellung: Sperre, Zahlungsdetails und Zeitpunkte für Streitfälle
alter table public.orders add column if not exists locked boolean not null default false;      -- Card gesperrt (zählt nicht)
alter table public.orders add column if not exists lock_reason text;                             -- 'dispute' | 'refund'
alter table public.orders add column if not exists dispute_status text;                          -- Stand bei Stripe
alter table public.orders add column if not exists charge text;                                  -- Stripe-Zahlung (ch_…)
alter table public.orders add column if not exists payment_method text;                          -- card, klarna, …
alter table public.orders add column if not exists card_info text;                               -- z. B. "visa •••• 4242"
alter table public.orders add column if not exists three_d_secure text;                          -- Ergebnis 3D Secure
alter table public.orders add column if not exists email text;                                   -- an diese Adresse ging die Bestätigung
alter table public.orders add column if not exists delivered_at timestamptz;                     -- Card in der App angekommen
alter table public.orders add column if not exists revealed_at timestamptz;                      -- Card aufgedeckt
alter table public.orders add column if not exists mail_sent_at timestamptz;                     -- Kaufbestätigung verschickt
alter table public.orders add column if not exists mail_id text;                                 -- Kennung beim Mail-Dienst

-- Kauf-Nachweis: IP-Adresse beim Kauf (für Streitfälle)
alter table public.purchase_evidence add column if not exists ip text check (ip is null or char_length(ip) <= 60);

-- Konto-Sperre für Käufe (z. B. nach einer Rückbuchung). Aufheben: Zeile löschen oder blocked = false setzen.
create table if not exists public.account_flags (
  user_id uuid primary key references auth.users (id) on delete cascade,
  blocked boolean not null default true,
  reason text,
  created_at timestamptz not null default now(),
  note text
);
alter table public.account_flags enable row level security;
drop policy if exists "Sperre lesen" on public.account_flags;
create policy "Sperre lesen" on public.account_flags
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.account_flags from anon, authenticated;
grant select on public.account_flags to authenticated;

-- App meldet: Card angekommen ('delivered') bzw. aufgedeckt ('revealed'). Zeitpunkt setzt der Server,
-- nur für eigene, bezahlte Bestellungen und nur beim ersten Mal.
create or replace function public.mark_card_event(p_order uuid, p_event text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event = 'delivered' then
    update orders set delivered_at = now() where id = p_order and user_id = auth.uid() and status = 'paid' and delivered_at is null;
  elsif p_event = 'revealed' then
    update orders set revealed_at = now(), delivered_at = coalesce(delivered_at, now())
      where id = p_order and user_id = auth.uid() and status = 'paid' and revealed_at is null;
  end if;
end $$;
revoke all on function public.mark_card_event(uuid, text) from public, anon;
grant execute on function public.mark_card_event(uuid, text) to authenticated;

-- Widerruf: Bestätigungs-Mail
alter table public.withdrawals add column if not exists mail_sent_at timestamptz;
alter table public.withdrawals add column if not exists expired boolean;   -- Widerrufsrecht war bereits erloschen
alter table public.withdrawals add column if not exists order_id uuid references public.orders (id) on delete set null;

-- Übersicht für Streitfälle (nur im Dashboard sichtbar, nicht über die App-Schnittstelle)
create schema if not exists admin;
revoke all on schema admin from public, anon, authenticated;
create or replace view admin.dispute_evidence as
select
  o.serial                         as seriennummer,
  o.amount                         as betrag_eur,
  o.status, o.locked as gesperrt, o.lock_reason as sperrgrund, o.dispute_status as streitfall,
  o.payment_intent, o.charge, o.payment_method as zahlart, o.card_info as karte, o.three_d_secure as "3d_secure",
  o.email                          as kunden_email,
  e.created_at                     as zustimmung_am,
  e.agb_accepted as agb, e.adult_confirmed as ab_18, e.waiver_accepted as verzicht_widerrufsrecht,
  e.legal_version                  as agb_fassung,
  e.ip, e.user_agent                as geraet,
  o.created_at                     as bestellt_am,
  o.paid_at                        as bezahlt_am,
  o.mail_sent_at                   as bestaetigung_gesendet_am,
  o.delivered_at                   as card_ausgeliefert_am,
  o.revealed_at                    as card_aufgedeckt_am,
  o.id as order_id, o.user_id
from public.orders o
left join public.purchase_evidence e on e.order_id = o.id;


-- ===== Entwicklung: „Alles zurücksetzen“ löscht auch die eigenen TESTKÄUFE (V121) =====
-- Gelöscht werden nur eigene Bestellungen aus dem Stripe-Testmodus (Sitzung beginnt mit cs_test_) und
-- eigene offene Bestellungen ohne Stripe-Sitzung. Echte Käufe (cs_live_…) bleiben IMMER erhalten
-- (Aufbewahrungspflicht für Kaufbelege, Beweise für Streitfälle). Eine Konto-Sperre wird nur aufgehoben,
-- wenn das Konto keinen einzigen echten Kauf hat. Der Knopf wird vor dem Release entfernt (Startliste s3).
create or replace function public.reset_test_orders()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then return 0; end if;
  delete from purchase_evidence e using orders o
    where e.order_id = o.id and o.user_id = auth.uid()
      and (left(o.stripe_session, 8) = 'cs_test_' or (o.stripe_session is null and o.status <> 'paid'));
  with d as (
    delete from orders
      where user_id = auth.uid()
        and (left(stripe_session, 8) = 'cs_test_' or (stripe_session is null and status <> 'paid'))
      returning 1
  ) select count(*) into n from d;
  if not exists (select 1 from orders where user_id = auth.uid() and left(stripe_session, 8) = 'cs_live_') then
    delete from account_flags where user_id = auth.uid();
  end if;
  return n;
end $$;
revoke all on function public.reset_test_orders() from public, anon;
grant execute on function public.reset_test_orders() to authenticated;
