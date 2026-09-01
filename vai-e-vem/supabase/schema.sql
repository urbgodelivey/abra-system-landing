-- Vai e Vem MVP — banco EXCLUSIVO do projeto Vai e Vem.
-- NUNCA executar no Supabase da ArkGo, UrbGo, ABRA ou qualquer projeto original.
-- Este arquivo é reproduzível e deve ser aplicado somente ao projeto dedicado do Vai e Vem.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

do $$ begin
  create type public.user_role as enum ('establishment', 'driver', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.delivery_status as enum (
    'requested',
    'accepted',
    'going_to_pickup',
    'picked_up',
    'delivering',
    'delivered',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum ('cash', 'pix');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('pending', 'paid', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'establishment',
  full_name text,
  business_name text,
  phone text,
  pickup_address text,
  pickup_lat double precision,
  pickup_lng double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_config (
  id smallint primary key check (id = 1),
  minimum_price numeric(10,2) not null check (minimum_price >= 0),
  included_km numeric(8,2) not null check (included_km >= 0),
  price_per_extra_km numeric(10,2) not null check (price_per_extra_km >= 0),
  active boolean not null default true,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.pricing_config (id, minimum_price, included_km, price_per_extra_km, active)
values (1, 7.00, 3.00, 1.50, true)
on conflict (id) do nothing;

create table if not exists public.app_config (
  id smallint primary key check (id = 1),
  pix_key text,
  pix_holder text not null default 'Vai e Vem',
  pix_city text not null default 'Caruaru',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.app_config (id, pix_holder, pix_city)
values (1, 'Vai e Vem', 'Caruaru')
on conflict (id) do nothing;

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.profiles(id),
  driver_id uuid references public.profiles(id),
  pickup_address text not null,
  pickup_lat double precision,
  pickup_lng double precision,
  delivery_address text not null,
  delivery_lat double precision,
  delivery_lng double precision,
  distance_km numeric(8,2) not null check (distance_km >= 0),
  price numeric(10,2) not null default 0 check (price >= 0),
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'pending',
  status public.delivery_status not null default 'requested',
  recipient_name text,
  recipient_phone text,
  notes text,
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  going_to_pickup_at timestamptz,
  picked_up_at timestamptz,
  delivering_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_locations (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  delivery_id uuid references public.deliveries(id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  heading double precision,
  speed_mps double precision,
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_messages (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists deliveries_establishment_idx on public.deliveries(establishment_id, created_at desc);
create index if not exists deliveries_driver_idx on public.deliveries(driver_id, created_at desc);
create index if not exists deliveries_status_idx on public.deliveries(status, created_at desc);
create index if not exists delivery_messages_delivery_idx on public.delivery_messages(delivery_id, created_at);

create or replace function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
$$;
revoke all on function private.current_user_role() from public, anon;
grant execute on function private.current_user_role() to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, role, full_name, business_name, phone)
  values (
    new.id,
    'establishment',
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'business_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

drop trigger if exists pricing_set_updated_at on public.pricing_config;
create trigger pricing_set_updated_at
before update on public.pricing_config
for each row execute function private.set_updated_at();

drop trigger if exists app_config_set_updated_at on public.app_config;
create trigger app_config_set_updated_at
before update on public.app_config
for each row execute function private.set_updated_at();

drop trigger if exists deliveries_set_updated_at on public.deliveries;
create trigger deliveries_set_updated_at
before update on public.deliveries
for each row execute function private.set_updated_at();

drop trigger if exists locations_set_updated_at on public.driver_locations;
create trigger locations_set_updated_at
before update on public.driver_locations
for each row execute function private.set_updated_at();

create or replace function private.calculate_delivery_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cfg public.pricing_config%rowtype;
  extra_km numeric;
begin
  select * into cfg
  from public.pricing_config
  where id = 1 and active = true;

  if not found then
    raise exception 'Pricing configuration is not active';
  end if;

  extra_km := greatest(new.distance_km - cfg.included_km, 0);
  new.price := round((cfg.minimum_price + (extra_km * cfg.price_per_extra_km))::numeric, 2);
  return new;
end;
$$;
revoke all on function private.calculate_delivery_price() from public, anon, authenticated;

drop trigger if exists deliveries_calculate_price on public.deliveries;
create trigger deliveries_calculate_price
before insert or update of distance_km on public.deliveries
for each row execute function private.calculate_delivery_price();

create or replace function private.protect_delivery_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.user_role;
begin
  r := private.current_user_role();

  if r = 'admin' then
    return new;
  end if;

  if r = 'establishment' then
    if old.establishment_id <> (select auth.uid()) then
      raise exception 'Not allowed';
    end if;

    if old.status <> 'requested' then
      raise exception 'An establishment can only edit or cancel a requested delivery';
    end if;

    if new.establishment_id is distinct from old.establishment_id
       or new.driver_id is distinct from old.driver_id
       or new.pickup_address is distinct from old.pickup_address
       or new.pickup_lat is distinct from old.pickup_lat
       or new.pickup_lng is distinct from old.pickup_lng
       or new.delivery_address is distinct from old.delivery_address
       or new.delivery_lat is distinct from old.delivery_lat
       or new.delivery_lng is distinct from old.delivery_lng
       or new.distance_km is distinct from old.distance_km
       or new.price is distinct from old.price
       or new.payment_method is distinct from old.payment_method
       or new.payment_status is distinct from old.payment_status
       or new.accepted_at is distinct from old.accepted_at
       or new.going_to_pickup_at is distinct from old.going_to_pickup_at
       or new.picked_up_at is distinct from old.picked_up_at
       or new.delivering_at is distinct from old.delivering_at
       or new.delivered_at is distinct from old.delivered_at
       or new.cancelled_at is distinct from old.cancelled_at then
      raise exception 'Protected delivery fields cannot be changed';
    end if;

    if new.status is distinct from old.status and new.status <> 'cancelled' then
      raise exception 'An establishment can only cancel a requested delivery';
    end if;

    return new;
  end if;

  if r = 'driver' then
    if old.status = 'requested' and old.driver_id is null then
      if new.driver_id <> (select auth.uid()) or new.status <> 'accepted' then
        raise exception 'Invalid accept transition';
      end if;
    elsif old.driver_id = (select auth.uid()) then
      if new.driver_id is distinct from old.driver_id
         or new.establishment_id is distinct from old.establishment_id
         or new.pickup_address is distinct from old.pickup_address
         or new.pickup_lat is distinct from old.pickup_lat
         or new.pickup_lng is distinct from old.pickup_lng
         or new.delivery_address is distinct from old.delivery_address
         or new.delivery_lat is distinct from old.delivery_lat
         or new.delivery_lng is distinct from old.delivery_lng
         or new.distance_km is distinct from old.distance_km
         or new.price is distinct from old.price
         or new.payment_method is distinct from old.payment_method
         or new.payment_status is distinct from old.payment_status
         or new.recipient_name is distinct from old.recipient_name
         or new.recipient_phone is distinct from old.recipient_phone
         or new.notes is distinct from old.notes
         or new.accepted_at is distinct from old.accepted_at
         or new.going_to_pickup_at is distinct from old.going_to_pickup_at
         or new.picked_up_at is distinct from old.picked_up_at
         or new.delivering_at is distinct from old.delivering_at
         or new.delivered_at is distinct from old.delivered_at
         or new.cancelled_at is distinct from old.cancelled_at then
        raise exception 'Protected delivery fields cannot be changed';
      end if;

      if not (
        new.status = old.status
        or (old.status = 'accepted' and new.status = 'going_to_pickup')
        or (old.status = 'going_to_pickup' and new.status = 'picked_up')
        or (old.status = 'picked_up' and new.status = 'delivering')
        or (old.status = 'delivering' and new.status = 'delivered')
        or (old.status in ('accepted', 'going_to_pickup') and new.status = 'cancelled')
      ) then
        raise exception 'Invalid delivery status transition';
      end if;
    else
      raise exception 'Not allowed';
    end if;

    return new;
  end if;

  raise exception 'Role not allowed';
end;
$$;
revoke all on function private.protect_delivery_update() from public, anon, authenticated;

drop trigger if exists deliveries_protect_update on public.deliveries;
create trigger deliveries_protect_update
before update on public.deliveries
for each row execute function private.protect_delivery_update();

create or replace function private.set_delivery_status_times()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    case new.status
      when 'accepted' then new.accepted_at = coalesce(new.accepted_at, now());
      when 'going_to_pickup' then new.going_to_pickup_at = coalesce(new.going_to_pickup_at, now());
      when 'picked_up' then new.picked_up_at = coalesce(new.picked_up_at, now());
      when 'delivering' then new.delivering_at = coalesce(new.delivering_at, now());
      when 'delivered' then new.delivered_at = coalesce(new.delivered_at, now());
      when 'cancelled' then new.cancelled_at = coalesce(new.cancelled_at, now());
      else null;
    end case;
  end if;
  return new;
end;
$$;
revoke all on function private.set_delivery_status_times() from public, anon, authenticated;

drop trigger if exists deliveries_status_times on public.deliveries;
create trigger deliveries_status_times
before update on public.deliveries
for each row execute function private.set_delivery_status_times();

alter table public.profiles enable row level security;
alter table public.pricing_config enable row level security;
alter table public.app_config enable row level security;
alter table public.deliveries enable row level security;
alter table public.driver_locations enable row level security;
alter table public.delivery_messages enable row level security;

revoke all on public.profiles, public.pricing_config, public.app_config, public.deliveries, public.driver_locations, public.delivery_messages from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, business_name, phone, pickup_address, pickup_lat, pickup_lng) on public.profiles to authenticated;

grant select on public.pricing_config to authenticated;
grant update (minimum_price, included_km, price_per_extra_km, active, updated_by) on public.pricing_config to authenticated;

grant select on public.app_config to authenticated;
grant update (pix_key, pix_holder, pix_city, updated_by) on public.app_config to authenticated;

grant select, insert, update on public.deliveries to authenticated;
grant select, insert, update on public.driver_locations to authenticated;
grant select, insert on public.delivery_messages to authenticated;

drop policy if exists profiles_select_related on public.profiles;
create policy profiles_select_related on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or private.current_user_role() = 'admin'
  or (
    private.current_user_role() = 'driver'
    and exists (
      select 1 from public.deliveries d
      where d.establishment_id = profiles.id
        and (d.status = 'requested' or d.driver_id = (select auth.uid()))
    )
  )
  or (
    private.current_user_role() = 'establishment'
    and exists (
      select 1 from public.deliveries d
      where d.establishment_id = (select auth.uid())
        and d.driver_id = profiles.id
    )
  )
);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists pricing_select_authenticated on public.pricing_config;
create policy pricing_select_authenticated on public.pricing_config
for select to authenticated using (true);

drop policy if exists pricing_update_admin on public.pricing_config;
create policy pricing_update_admin on public.pricing_config
for update to authenticated
using (private.current_user_role() = 'admin')
with check (private.current_user_role() = 'admin');

drop policy if exists app_config_select_authenticated on public.app_config;
create policy app_config_select_authenticated on public.app_config
for select to authenticated using (true);

drop policy if exists app_config_update_admin on public.app_config;
create policy app_config_update_admin on public.app_config
for update to authenticated
using (private.current_user_role() = 'admin')
with check (private.current_user_role() = 'admin');

drop policy if exists deliveries_select_establishment on public.deliveries;
create policy deliveries_select_establishment on public.deliveries
for select to authenticated
using (establishment_id = (select auth.uid()));

drop policy if exists deliveries_select_driver on public.deliveries;
create policy deliveries_select_driver on public.deliveries
for select to authenticated
using (
  private.current_user_role() = 'driver'
  and (status = 'requested' or driver_id = (select auth.uid()))
);

drop policy if exists deliveries_select_admin on public.deliveries;
create policy deliveries_select_admin on public.deliveries
for select to authenticated
using (private.current_user_role() = 'admin');

drop policy if exists deliveries_insert_establishment on public.deliveries;
create policy deliveries_insert_establishment on public.deliveries
for insert to authenticated
with check (
  private.current_user_role() = 'establishment'
  and establishment_id = (select auth.uid())
  and driver_id is null
  and status = 'requested'
  and payment_status = 'pending'
);

drop policy if exists deliveries_update_establishment on public.deliveries;
create policy deliveries_update_establishment on public.deliveries
for update to authenticated
using (establishment_id = (select auth.uid()))
with check (establishment_id = (select auth.uid()));

drop policy if exists deliveries_update_driver on public.deliveries;
create policy deliveries_update_driver on public.deliveries
for update to authenticated
using (
  private.current_user_role() = 'driver'
  and (driver_id = (select auth.uid()) or (driver_id is null and status = 'requested'))
)
with check (driver_id = (select auth.uid()));

drop policy if exists deliveries_update_admin on public.deliveries;
create policy deliveries_update_admin on public.deliveries
for update to authenticated
using (private.current_user_role() = 'admin')
with check (private.current_user_role() = 'admin');

drop policy if exists locations_select_driver on public.driver_locations;
create policy locations_select_driver on public.driver_locations
for select to authenticated
using (driver_id = (select auth.uid()));

drop policy if exists locations_select_establishment on public.driver_locations;
create policy locations_select_establishment on public.driver_locations
for select to authenticated
using (
  delivery_id is not null
  and exists (
    select 1 from public.deliveries d
    where d.id = driver_locations.delivery_id
      and d.establishment_id = (select auth.uid())
      and d.driver_id = driver_locations.driver_id
      and d.status not in ('delivered', 'cancelled')
  )
);

drop policy if exists locations_select_admin on public.driver_locations;
create policy locations_select_admin on public.driver_locations
for select to authenticated
using (private.current_user_role() = 'admin');

drop policy if exists locations_insert_driver on public.driver_locations;
create policy locations_insert_driver on public.driver_locations
for insert to authenticated
with check (
  private.current_user_role() = 'driver'
  and driver_id = (select auth.uid())
  and (
    delivery_id is null
    or exists (
      select 1 from public.deliveries d
      where d.id = driver_locations.delivery_id
        and d.driver_id = (select auth.uid())
        and d.status not in ('delivered', 'cancelled')
    )
  )
);

drop policy if exists locations_update_driver on public.driver_locations;
create policy locations_update_driver on public.driver_locations
for update to authenticated
using (private.current_user_role() = 'driver' and driver_id = (select auth.uid()))
with check (
  private.current_user_role() = 'driver'
  and driver_id = (select auth.uid())
  and (
    delivery_id is null
    or exists (
      select 1 from public.deliveries d
      where d.id = driver_locations.delivery_id
        and d.driver_id = (select auth.uid())
        and d.status not in ('delivered', 'cancelled')
    )
  )
);

drop policy if exists locations_insert_admin on public.driver_locations;
create policy locations_insert_admin on public.driver_locations
for insert to authenticated
with check (private.current_user_role() = 'admin');

drop policy if exists locations_update_admin on public.driver_locations;
create policy locations_update_admin on public.driver_locations
for update to authenticated
using (private.current_user_role() = 'admin')
with check (private.current_user_role() = 'admin');

drop policy if exists messages_select_participants on public.delivery_messages;
create policy messages_select_participants on public.delivery_messages
for select to authenticated
using (
  exists (
    select 1 from public.deliveries d
    where d.id = delivery_messages.delivery_id
      and (
        d.establishment_id = (select auth.uid())
        or d.driver_id = (select auth.uid())
        or private.current_user_role() = 'admin'
      )
  )
);

drop policy if exists messages_insert_participants on public.delivery_messages;
create policy messages_insert_participants on public.delivery_messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.deliveries d
    where d.id = delivery_messages.delivery_id
      and (
        d.establishment_id = (select auth.uid())
        or d.driver_id = (select auth.uid())
        or private.current_user_role() = 'admin'
      )
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deliveries'
  ) then
    alter publication supabase_realtime add table public.deliveries;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'driver_locations'
  ) then
    alter publication supabase_realtime add table public.driver_locations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'delivery_messages'
  ) then
    alter publication supabase_realtime add table public.delivery_messages;
  end if;
end $$;

-- Bootstrap seguro:
-- 1) o primeiro cadastro nasce sempre como establishment;
-- 2) nunca use user_metadata para autorização;
-- 3) após identificar o usuário administrativo, altere a role via SQL administrativo;
-- 4) nenhum service_role ou secret deve ser colocado no frontend.
