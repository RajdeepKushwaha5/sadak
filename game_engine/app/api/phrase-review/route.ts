import { NextResponse } from "next/server";
import { recordPhraseOutcomes } from "@/lib/game/phrase-memory-store";
import type { PhraseOutcome } from "@/lib/game/phrase-memory";
import { loadDistrictById } from "@/lib/game/load-district";
import { barberTaskFor } from "@/lib/game/tasks";
import { canonicalPhraseIndex, phraseKey } from "@/lib/game/due";

export const runtime = "nodejs";

type Body = {
  districtId?: string;
  lang?: string;
  /** Scripted drill lines, scored per word by scoreAttempt. */
  attempts?: { phraseNative?: string; points?: number; answerVisible?: boolean }[];
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

  const loaded = await loadDistrictById(districtId);
  if (!loaded) return NextResponse.json({ error: "Unknown district." }, { status: 404 });
  // The optional barber lives outside the stored pack but still teaches lines.
  const canonical = canonicalPhraseIndex([...loaded.tasks, barberTaskFor(districtId)]);
  const resolve = (text: unknown) =>
    typeof text === "string" ? canonical.get(phraseKey(text)) ?? null : null;

  const outcomes: PhraseOutcome[] = [];
  let dropped = 0;

  for (const a of body.attempts ?? []) {
    const phraseNative = resolve(a.phraseNative);
    if (!phraseNative || typeof a.points !== "number" || !Number.isFinite(a.points)) {
      dropped += 1;
      continue;
    }
    outcomes.push({
      phraseNative,
      source: "drill",
      points: Math.max(0, Math.min(100, a.points)),
      // Absent means the line was on screen, which is the drill's default.
      // Recall has to be claimed explicitly, never assumed.
      answerVisible: a.answerVisible !== false,
    });
  }

  // The errand reports only what the player actually produced, so there is no
  // score to carry: being understood without a script is the judgement. Each
  // lesson line counts once per request however many times it was reported.
  const englishFallback = body.englishFallback === true;
  const seen = new Set<string>();
  for (const raw of body.used ?? []) {
    const phraseNative = resolve(raw);
    if (!phraseNative) {
      dropped += 1;
      continue;
    }
    if (seen.has(phraseNative)) continue;
    seen.add(phraseNative);
    outcomes.push({ phraseNative, source: "errand", englishFallback });
  }

  if (outcomes.length === 0) return NextResponse.json({ recorded: 0, dropped });

  const result = await recordPhraseOutcomes(outcomes, { districtId, lang });
  if (!result.ok) {
    const status = result.reason === "signed-out" ? 401 : 500;
    return NextResponse.json({ recorded: 0, dropped, error: result.reason }, { status });
  }
  return NextResponse.json({ recorded: result.recorded, dropped });
}
