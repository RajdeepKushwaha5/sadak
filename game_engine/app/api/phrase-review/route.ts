import { NextResponse } from "next/server";
import { recordPhraseOutcomes } from "@/lib/game/phrase-memory-store";
import type { PhraseOutcome } from "@/lib/game/phrase-memory";

export const runtime = "nodejs";

type Body = {
  districtId?: string;
  lang?: string;
  /** Scripted drill lines, scored per word by scoreAttempt. */
  attempts?: { phraseNative?: string; points?: number }[];
  /** Phrases the model saw the player genuinely use in the errand. */
  used?: string[];
  englishFallback?: boolean;
};

/**
 * Record spoken attempts against the retention schedule.
 *
 * The drill is scored in the browser by `scoreAttempt`, but phrase_memory is
 * RLS-scoped to the signed-in user, so the write has to come back through the
 * server. Scores are advisory either way: they only ever move the player's
 * own review schedule, never anything another player can see.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const districtId = body.districtId?.trim();
  const lang = body.lang?.trim();
  if (!districtId || !lang) {
    return NextResponse.json({ error: "districtId and lang are required." }, { status: 400 });
  }

  const outcomes: PhraseOutcome[] = [];

  for (const a of body.attempts ?? []) {
    const phraseNative = a.phraseNative?.trim();
    if (!phraseNative || typeof a.points !== "number" || !Number.isFinite(a.points)) continue;
    outcomes.push({
      phraseNative,
      source: "drill",
      points: Math.max(0, Math.min(100, a.points)),
    });
  }

  // The errand reports only what the player actually produced, so there is no
  // score to carry: being understood without a script is the judgement.
  const englishFallback = body.englishFallback === true;
  for (const raw of body.used ?? []) {
    const phraseNative = typeof raw === "string" ? raw.trim() : "";
    if (!phraseNative) continue;
    outcomes.push({ phraseNative, source: "errand", englishFallback });
  }

  if (outcomes.length === 0) return NextResponse.json({ recorded: 0 });

  await recordPhraseOutcomes(outcomes, { districtId, lang });
  return NextResponse.json({ recorded: outcomes.length });
}
