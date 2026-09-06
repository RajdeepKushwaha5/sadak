-- SADAK: daily practice streaks.
--
-- phrase_memory says what is due; this says whether the player showed up.
-- Kept separate from district_progress because a streak is global to the
-- learner, not per district: practising Hindi on Monday and Tamil on Tuesday
-- is still two consecutive days of practice.

create table if not exists public.practice_streak (
  user_id uuid primary key references auth.users (id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  -- Date in the player's own timezone, not UTC: practising at 1am in Delhi
  -- counts for that day.
  last_cleared_on date,
  updated_at timestamptz not null default now()
);

alter table public.practice_streak enable row level security;

create policy "Users read own streak"
  on public.practice_streak
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own streak"
  on public.practice_streak
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update own streak"
  on public.practice_streak
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
