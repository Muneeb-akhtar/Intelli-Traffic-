-- ============================================================
--  Intelli Traffic — Supabase Database Setup
--  Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Profiles table
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  created_at  timestamptz default now() not null
);

-- 2. Enable RLS
alter table public.profiles enable row level security;

-- 3. Drop existing policies if they exist, then recreate
drop policy if exists "Users can view own profile"   on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 4. Auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Analytics table
create table if not exists public.analytics (
  id                   bigserial primary key,
  timestamp            text not null,
  hour                 text,
  counts               jsonb,
  total_vehicles       integer default 0,
  average_wait_seconds float   default 0,
  congestion_index     float   default 0,
  created_at           timestamptz default now()
);
alter table public.analytics disable row level security;

-- 6. Safety logs table
create table if not exists public.safety_logs (
  id         bigserial primary key,
  timestamp  text not null,
  type       text not null,
  message    text,
  created_at timestamptz default now()
);
alter table public.safety_logs disable row level security;
