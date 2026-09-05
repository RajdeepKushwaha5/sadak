import { createClient } from "@/lib/supabase/server";
import {
  memoryToUpsert,
  review,
  rowToMemory,
  type PhraseMemory,
  type PhraseMemoryRow,
  type PhraseOutcome,
} from "@/lib/game/phrase-memory";

/**
 * Persist one turn's worth of phrase outcomes.
 *
 * Signed-out play is allowed, so a missing session is a no-op rather than an
 * error. Retention is a side effect of the conversation: a failure here must
 * never break the conversation itself, so the caller does not await a result
 * it can act on.
 */
export async function recordPhraseOutcomes(
  outcomes: PhraseOutcome[],
  context: { districtId: string; lang: string },
): Promise<void> {
  if (outcomes.length === 0) return;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;

  const phrases = outcomes.map((o) => o.phraseNative);

  const { data: existing, error: readError } = await supabase
    .from("phrase_memory")
    .select("*")
    .eq("user_id", userId)
    .in("phrase_native", phrases);

  if (readError) {
    console.error("phrase_memory read failed", readError);
    return;
  }

  const byPhrase = new Map<string, PhraseMemory>(
    (existing ?? []).map((row) => {
      const memory = rowToMemory(row as PhraseMemoryRow);
      return [memory.phraseNative, memory];
    }),
  );

  const now = new Date();
  const rows = outcomes.map((outcome) =>
    memoryToUpsert(
      userId,
      review(byPhrase.get(outcome.phraseNative) ?? null, outcome, context, now),
    ),
  );

  const { error: writeError } = await supabase
    .from("phrase_memory")
    .upsert(rows, { onConflict: "user_id,phrase_native" });

  if (writeError) console.error("phrase_memory write failed", writeError);
}
