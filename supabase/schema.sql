-- SAT VocaMaster: accounts table layout for Supabase.
-- Run this once in the Supabase SQL editor (or `supabase db push`) before filling in
-- VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Row-level security keeps every row private
-- to the account that owns it, so the anon key can safely ship in the browser build.

create table if not exists public.progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  states jsonb not null default '{}'::jsonb,     -- per-word SM-2 state, keyed by word id
  activity jsonb not null default '{}'::jsonb,   -- { 'YYYY-MM-DD': reviews }
  xp integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  timestamp bigint not null,
  mode text not null default 'practice',
  words_reviewed integer not null default 0,
  correct integer not null default 0,
  xp integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_timestamp_idx on public.sessions (user_id, timestamp desc);

alter table public.progress enable row level security;
alter table public.sessions enable row level security;

-- One policy per table per action: an account may only touch its own rows.
drop policy if exists "progress is private to its owner" on public.progress;
create policy "progress is private to its owner" on public.progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "sessions are private to their owner" on public.sessions;
create policy "sessions are private to their owner" on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
