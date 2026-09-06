/**
 * Daily practice streaks.
 *
 * A streak is the one part of a review app people actually feel, so the rule
 * has to be defensible: it counts *consecutive days on which a round was
 * cleared*, never days opened, and never partial rounds. Somebody who walks
 * one street and quits has not practised.
 */
export type Streak = {
  current: number;
  longest: number;
  /** ISO date (YYYY-MM-DD) of the last cleared round, in the player's day. */
  lastClearedOn: string | null;
};

export type StreakRow = {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_cleared_on: string | null;
};

export const emptyStreak: Streak = { current: 0, longest: 0, lastClearedOn: null };

/**
 * Day keys are computed from the player's own offset, not UTC. Someone
 * practising at 1am in Delhi has practised today, and a UTC boundary would
 * quietly break their streak while they were still awake.
 */
export function dayKey(at: Date, offsetMinutes: number): string {
  const local = new Date(at.getTime() - offsetMinutes * 60_000);
  return local.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

/**
 * Advance the streak for a round cleared on `today`.
 *
 * Clearing a second round the same day is a no-op rather than an increment:
 * the streak measures days practised, and grinding four rounds on Sunday is
 * not the same as showing up four days running.
 */
export function clearRound(streak: Streak, today: string): Streak {
  if (streak.lastClearedOn === today) return streak;

  const gap = streak.lastClearedOn ? daysBetween(streak.lastClearedOn, today) : null;
  const current = gap === 1 ? streak.current + 1 : 1;

  return {
    current,
    longest: Math.max(streak.longest, current),
    lastClearedOn: today,
  };
}

/**
 * What the streak reads as *now*, without writing anything.
 *
 * A streak whose last clear was before yesterday is already broken, but the
 * row still says otherwise until the next clear — so the display has to
 * decide, not the stored number.
 */
export function streakAsOf(streak: Streak, today: string): { current: number; atRisk: boolean } {
  if (!streak.lastClearedOn) return { current: 0, atRisk: false };
  const gap = daysBetween(streak.lastClearedOn, today);
  if (gap === 0) return { current: streak.current, atRisk: false };
  // Cleared yesterday: the streak stands, but today is still unpractised.
  if (gap === 1) return { current: streak.current, atRisk: true };
  return { current: 0, atRisk: false };
}

export function rowToStreak(row: StreakRow): Streak {
  return {
    current: row.current_streak,
    longest: row.longest_streak,
    lastClearedOn: row.last_cleared_on,
  };
}

export function streakToUpsert(userId: string, streak: Streak): StreakRow {
  return {
    user_id: userId,
    current_streak: streak.current,
    longest_streak: streak.longest,
    last_cleared_on: streak.lastClearedOn,
  };
}
