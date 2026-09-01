-- Vai e Vem MVP — schema para um NOVO projeto Supabase separado da ArkGo.
-- NÃO executar no banco original da ArkGo/UrbGo.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('client','driver','admin')),
  name text not null,
  phone text,
  establishment_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.pricing_config (
  id uuid primary key default gen_random_uuid(),
  active boolean not null default true,
  minimum_price numeric(10,2) not null default 7.00,
  included_km numeric(10,2) not null default 3.00,
  price_per_extra_km numeric(10,2) not null default 1.50,
  updated_at timestamptz not null default now()
);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.profiles(id),
  driver_id uuid references public.profiles(id),
  pickup_address text not null,
  pickup_lat double precision,
  pickup_lng double precision,
  delivery_address text not null,
  delivery_lat double precision,
  delivery_lng double precision,
  distance_km numeric(10,2) not null default 0,
  price numeric(10,2) not null,
  payment_method text not null check (payment_method in ('money','pix')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','cancelled')),
  status text not null default 'requested' check (status in ('requested','accepted','going_to_pickup','picked_up','delivering','delivered','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_locations (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  heading double precision,
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_messages (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists deliveries_client_idx on public.deliveries(client_id, created_at desc);
create index if not exists deliveries_driver_idx on public.deliveries(driver_id, created_at desc);
create index if not exists deliveries_status_idx on public.deliveries(status, created_at desc);
create index if not exists delivery_messages_delivery_idx on public.delivery_messages(delivery_id, created_at);

alter table public.profiles enable row level security;
alter table public.deliveries enable row level security;
alter table public.driver_locations enable row level security;
alter table public.delivery_messages enable row level security;
alter table public.pricing_config enable row level security;

-- Políticas definitivas devem ser aplicadas somente após criar o NOVO projeto Supabase,
-- definir o usuário administrador e confirmar o modelo de cadastro dos estabelecimentos.
-- O MVP não deve reutilizar service_role, secrets ou políticas do projeto ArkGo.
