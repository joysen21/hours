-- Stunden – Datenbankschema für Supabase
-- Im Supabase-Dashboard unter "SQL Editor" einmal komplett ausführen.

-- Kunden ---------------------------------------------------------------
create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create index if not exists customers_user_idx on public.customers(user_id);

-- Stundeneinträge (ein Wert pro Kunde und Tag) -------------------------
create table if not exists public.entries (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  day         date not null,
  hours       numeric(5,2) not null check (hours > 0 and hours <= 24),
  updated_at  timestamptz not null default now(),
  primary key (customer_id, day)
);
create index if not exists entries_user_day_idx on public.entries(user_id, day);

-- Zugriffsrechte ---------------------------------------------------------
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.entries   to authenticated;

-- Row Level Security: jeder sieht nur seine eigenen Daten ---------------
alter table public.customers enable row level security;
alter table public.entries   enable row level security;

drop policy if exists customers_own on public.customers;
create policy customers_own on public.customers
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists entries_own on public.entries;
create policy entries_own on public.entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.customers c
                where c.id = customer_id and c.user_id = (select auth.uid()))
  );

-- updated_at bei Änderung setzen ----------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();

-- Maximal 10 Kunden pro Benutzer ----------------------------------------
create or replace function public.check_customer_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.customers where user_id = new.user_id) >= 10 then
    raise exception 'Maximal 10 Kunden' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists customers_limit on public.customers;
create trigger customers_limit before insert on public.customers
  for each row execute function public.check_customer_limit();
