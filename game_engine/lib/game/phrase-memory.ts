import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";

/**
 * Per-phrase retention state. The conversation grader in /api/task-talk
 * already decides, every turn, whether the player produced a target phrase
 * and whether they needed help to do it. That verdict is a review grade — so
 * the errand *is* the review, and nothing extra has to be asked of the player.
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

/** How a single phrase went in one conversation turn. */
export type PhraseOutcome = {
  phraseNative: string;
  /** The player produced it without the hint being on screen. */
  unaided: boolean;
  /** The player fell back to English on this turn. */
  englishFallback: boolean;
};

const scheduler = fsrs();

/**
 * Map what the grader observed onto an FSRS grade.
 *
 * Falling back to English is a lapse even if the phrase appeared somewhere in
 * the turn: reaching for English is the signal that the phrase was not
 * available. Producing it only after reading the hint is recognition, not
 * recall, which is exactly what Hard means.
 */
export function gradeFor(outcome: PhraseOutcome): Grade {
  if (outcome.englishFallback) return Rating.Again;
  return outcome.unaided ? Rating.Good : Rating.Hard;
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
