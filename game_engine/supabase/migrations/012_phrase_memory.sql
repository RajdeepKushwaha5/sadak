-- SADAK: per-phrase retention model backing spaced repetition.
--
-- district_progress answers "did they finish the errand". It cannot answer
-- "can they still say this line next Tuesday". This table holds one row per
-- phrase per learner, carrying FSRS scheduler state so due phrases can be
-- routed back to the NPC who teaches them.

create table if not exists public.phrase_memory (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Native script is the identity: `roman` is a reading aid and drifts.
  phrase_native text not null,
  district_id text not null references public.districts (id) on delete cascade,
  lang text not null,

  -- FSRS state. Null stability/difficulty means "new, never reviewed".
  stability real,
  difficulty real,
  reps integer not null default 0,
  lapses integer not null default 0,
  -- FSRS card states: 0 new, 1 learning, 2 review, 3 relearning.
  state smallint not null default 0,

  last_seen_at timestamptz,
  due_at timestamptz,
  updated_at timestamptz not null default now(),

  primary key (user_id, phrase_native)
);

-- The daily round asks one question: what is due for me, now.
create index if not exists phrase_memory_due_idx
  on public.phrase_memory (user_id, due_at);

create index if not exists phrase_memory_district_idx
  on public.phrase_memory (user_id, district_id);

alter table public.phrase_memory enable row level security;

create policy "Users read own phrase memory"
  on public.phrase_memory
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own phrase memory"
  on public.phrase_memory
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update own phrase memory"
  on public.phrase_memory
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
