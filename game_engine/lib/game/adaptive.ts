import type { LessonTier } from "@/lib/game/levels";
import type { PhraseMemory } from "@/lib/game/phrase-memory";

/**
 * What a district's phrase history says about the player right now.
 *
 * `lessonTierFor` picks difficulty from *which errand you are on*, which is a
 * property of the map rather than of the learner: walk to the fourth NPC on
 * day one and the game hands you hard lines you have no basis for. These
 * counts are the evidence for choosing difficulty from recall instead.
 */
export type RetentionSignal = {
  /** Phrases with any review history here. */
  seen: number;
  /** Phrases whose recall should survive a week without a prompt. */
  held: number;
  /** Phrases already decayed past due. */
  overdue: number;
  /** Times a phrase was reached for and missed. */
  lapses: number;
};

/** Stability, in days, at which a phrase counts as genuinely held. */
const HELD_STABILITY_DAYS = 7;

/**
 * Below this many reviewed phrases the sample is too thin to override the
 * player's own comfort setting, so the static ladder still governs. A new
 * player therefore sees exactly today's behaviour.
 */
export const MIN_EVIDENCE = 4;

export function retentionSignal(
  memories: PhraseMemory[],
  now: Date = new Date(),
): RetentionSignal {
  let seen = 0;
  let held = 0;
  let overdue = 0;
  let lapses = 0;

  for (const m of memories) {
    if (m.stability === null) continue;
    seen += 1;
    lapses += m.lapses;
    if (m.stability >= HELD_STABILITY_DAYS) held += 1;
    if (m.dueAt && new Date(m.dueAt) <= now) overdue += 1;
  }

  return { seen, held, overdue, lapses };
}

const LADDER: LessonTier[] = ["easy", "medium", "hard"];

function step(tier: LessonTier, by: number): LessonTier {
  const i = LADDER.indexOf(tier);
  return LADDER[Math.max(0, Math.min(LADDER.length - 1, i + by))];
}

/**
 * Adjust the comfort-derived tier by one step, at most, in the direction the
 * evidence points.
 *
 * One step is deliberate: difficulty that lurches is worse than difficulty
 * that is slightly wrong, and the static ladder already encodes the player's
 * stated comfort. This nudges it, it does not replace it.
 */
export function adaptiveTier(signal: RetentionSignal, fallback: LessonTier): LessonTier {
  if (signal.seen < MIN_EVIDENCE) return fallback;

  const holdRate = signal.held / signal.seen;
  const overdueRate = signal.overdue / signal.seen;
  const lapseRate = signal.lapses / signal.seen;

  // Struggling outranks thriving: someone forgetting faster than they learn
  // should never be pushed up because an old phrase happens to have stuck.
  if (holdRate < 0.35 || overdueRate > 0.5 || lapseRate >= 1) return step(fallback, -1);
  if (holdRate >= 0.7 && overdueRate <= 0.25 && lapseRate < 0.5) return step(fallback, 1);
  return fallback;
}
