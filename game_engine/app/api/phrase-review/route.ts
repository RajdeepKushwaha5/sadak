import { NextResponse } from "next/server";
import { recordPhraseOutcomes } from "@/lib/game/phrase-memory-store";

export const runtime = "nodejs";

type Body = {
  districtId?: string;
  lang?: string;
  attempts?: { phraseNative?: string; points?: number }[];
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

  const attempts = (body.attempts ?? []).flatMap((a) => {
    const phraseNative = a.phraseNative?.trim();
    if (!phraseNative || typeof a.points !== "number" || !Number.isFinite(a.points)) return [];
    return [{ phraseNative, points: Math.max(0, Math.min(100, a.points)) }];
  });

  if (attempts.length === 0) return NextResponse.json({ recorded: 0 });

  await recordPhraseOutcomes(attempts, { districtId, lang });
  return NextResponse.json({ recorded: attempts.length });
}
