import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";

/**
 * Per-phrase retention state. Every drill line is already scored by
 * `scoreAttempt` against the exact phrase the player was asked to say, so
 * that score is a review grade — the errand *is* the review, and nothing
 * extra has to be asked of the player.
 */
export type PhraseMemory = {
  phraseNative: string;
  districtId: string;
  lang: string;
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
  state: number;
  lastSeenAt: string | null;
  dueAt: string | null;
};

export type PhraseMemoryRow = {
  user_id: string;
  phrase_native: string;
  district_id: string;
  lang: string;
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
  state: number;
  last_seen_at: string | null;
  due_at: string | null;
};

/** How a single phrase went in one spoken attempt. */
export type PhraseOutcome = {
  phraseNative: string;
  /** scoreAttempt's 0-100 verdict on the attempt. */
  points: number;
};

const scheduler = fsrs();

/**
 * Map a spoken attempt onto an FSRS grade.
 *
 * The thresholds are deliberately the same 72/40 bands `scoreAttempt` paints
 * words with and the dialogue plays its success/partial/error sounds on: a
 * player who hears "good" and then watches the phrase come back tomorrow as
 * if they had failed would rightly stop trusting the schedule.
 */
export function gradeFor(outcome: PhraseOutcome): Grade {
  if (outcome.points >= 90) return Rating.Easy;
  if (outcome.points >= 72) return Rating.Good;
  if (outcome.points >= 40) return Rating.Hard;
  return Rating.Again;
}

function toCard(memory: PhraseMemory | null, now: Date): Card {
  if (!memory || memory.stability === null || memory.difficulty === null) {
    return createEmptyCard(now);
  }
  return {
    due: memory.dueAt ? new Date(memory.dueAt) : now,
    stability: memory.stability,
    difficulty: memory.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: memory.reps,
    lapses: memory.lapses,
    state: memory.state as State,
    last_review: memory.lastSeenAt ? new Date(memory.lastSeenAt) : undefined,
  };
}

/**
 * Advance one phrase's schedule. Returns the state to persist; the caller
 * owns the write so a failed review never blocks the conversation.
 */
export function review(
  memory: PhraseMemory | null,
  outcome: PhraseOutcome,
  context: { districtId: string; lang: string },
  now: Date = new Date(),
): PhraseMemory {
  const { card } = scheduler.next(toCard(memory, now), now, gradeFor(outcome));

  return {
    phraseNative: outcome.phraseNative,
    districtId: memory?.districtId ?? context.districtId,
    lang: memory?.lang ?? context.lang,
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastSeenAt: now.toISOString(),
    dueAt: card.due.toISOString(),
  };
}

export function rowToMemory(row: PhraseMemoryRow): PhraseMemory {
  return {
    phraseNative: row.phrase_native,
    districtId: row.district_id,
    lang: row.lang,
    stability: row.stability,
    difficulty: row.difficulty,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    lastSeenAt: row.last_seen_at,
    dueAt: row.due_at,
  };
}

export function memoryToUpsert(userId: string, memory: PhraseMemory): PhraseMemoryRow {
  return {
    user_id: userId,
    phrase_native: memory.phraseNative,
    district_id: memory.districtId,
    lang: memory.lang,
    stability: memory.stability,
    difficulty: memory.difficulty,
    reps: memory.reps,
    lapses: memory.lapses,
    state: memory.state,
    last_seen_at: memory.lastSeenAt,
    due_at: memory.dueAt,
  };
}

/** Phrases whose recall has decayed past due, soonest first. */
export function dueNow(memories: PhraseMemory[], now: Date = new Date()): PhraseMemory[] {
  return memories
    .filter((m) => m.dueAt !== null && new Date(m.dueAt) <= now)
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());
}
