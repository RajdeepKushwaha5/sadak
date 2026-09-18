import { createClient } from "@/lib/supabase/server";
import {
  memoryToUpsert,
  review,
  rowToMemory,
  type PhraseMemory,
  type PhraseMemoryRow,
  type PhraseOutcome,
} from "@/lib/game/phrase-memory";

export type RecordResult =
  | { ok: true; recorded: number }
  | { ok: false; recorded: 0; reason: "signed-out" | "read-failed" | "write-failed" };

/**
 * Persist one turn's worth of phrase outcomes.
 *
 * Signed-out play is allowed, so a missing session records nothing, and says
 * so rather than claiming success. A failed read or write is reported to the
 * caller as a failure instead of being logged and swallowed: progress that
 * silently did not save is worse than progress that visibly did not.
 *
 * Several outcomes for the same phrase in one call collapse to the last one.
 * Postgres rejects an upsert that touches the same row twice, so passing
 * duplicates through would fail the whole batch.
 */
export async function recordPhraseOutcomes(
  outcomes: PhraseOutcome[],
  context: { districtId: string; lang: string },
): Promise<RecordResult> {
  if (outcomes.length === 0) return { ok: true, recorded: 0 };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return { ok: false, recorded: 0, reason: "signed-out" };

  const latest = new Map<string, PhraseOutcome>();
  for (const o of outcomes) latest.set(o.phraseNative, o);
  const unique = [...latest.values()];

  const { data: existing, error: readError } = await supabase
    .from("phrase_memory")
    .select("*")
    .eq("user_id", userId)
    .in(
      "phrase_native",
      unique.map((o) => o.phraseNative),
    );

  if (readError) {
    console.error("phrase_memory read failed", readError);
    return { ok: false, recorded: 0, reason: "read-failed" };
  }

  const byPhrase = new Map<string, PhraseMemory>(
    (existing ?? []).map((row) => {
      const memory = rowToMemory(row as PhraseMemoryRow);
      return [memory.phraseNative, memory];
    }),
  );

  const now = new Date();
  const rows = unique.map((outcome) =>
    memoryToUpsert(
      userId,
      review(byPhrase.get(outcome.phraseNative) ?? null, outcome, context, now),
    ),
  );

  const { error: writeError } = await supabase
    .from("phrase_memory")
    .upsert(rows, { onConflict: "user_id,phrase_native" });

  if (writeError) {
    console.error("phrase_memory write failed", writeError);
    return { ok: false, recorded: 0, reason: "write-failed" };
  }
  return { ok: true, recorded: rows.length };
}
