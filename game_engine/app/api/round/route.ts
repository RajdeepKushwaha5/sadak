import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadDistrictById } from "@/lib/game/load-district";
import { dueNow, rowToMemory, type PhraseMemoryRow } from "@/lib/game/phrase-memory";
import { groupDueByTask, indexPhraseSites, type DueTask } from "@/lib/game/due";
import {
  clearRound,
  dayKey,
  emptyStreak,
  rowToStreak,
  streakAsOf,
  streakToUpsert,
  type StreakRow,
} from "@/lib/game/streak";

export const runtime = "nodejs";

/** Enough to be worth the walk, few enough to finish before losing interest. */
const MAX_STOPS = 4;

type RoundStop = DueTask & { districtId: string; districtName: string };

function offsetFrom(req: Request): number {
  const raw = Number(new URL(req.url).searchParams.get("tzOffset"));
  // Date.getTimezoneOffset(): minutes *behind* local, so IST is -330.
  return Number.isFinite(raw) && Math.abs(raw) <= 840 ? raw : 0;
}

async function readStreak(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from("practice_streak").select("*").eq("user_id", userId).maybeSingle();
  return data ? rowToStreak(data as StreakRow) : emptyStreak;
}

/** Today's round: which stops, and where the streak stands. */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return NextResponse.json({ error: "Sign in to practise." }, { status: 401 });

  const today = dayKey(new Date(), offsetFrom(req));
  const streak = await readStreak(supabase, userId);

  const { data, error } = await supabase.from("phrase_memory").select("*").eq("user_id", userId);
  if (error) {
    console.error("phrase_memory read failed", error);
    return NextResponse.json({ error: "Could not load today's round." }, { status: 500 });
  }

  const now = new Date();
  const due = dueNow((data ?? []).map((r) => rowToMemory(r as PhraseMemoryRow)), now);

  const byDistrict = new Map<string, typeof due>();
  for (const m of due) {
    const b = byDistrict.get(m.districtId);
    if (b) b.push(m);
    else byDistrict.set(m.districtId, [m]);
  }

  const stops: RoundStop[] = [];
  for (const [districtId, memories] of byDistrict) {
    const loaded = await loadDistrictById(districtId);
    if (!loaded) continue;
    const { tasks } = groupDueByTask(memories, indexPhraseSites(loaded.tasks));
    for (const t of tasks) {
      stops.push({ ...t, districtId, districtName: loaded.district.name });
    }
  }

  // Most-decayed stops first, then truncate: a round the player finishes is
  // worth more than one that covers everything and gets abandoned.
  stops.sort((a, b) => b.phrases.length - a.phrases.length);

  return NextResponse.json({
    today,
    clearedToday: streak.lastClearedOn === today,
    streak: streakAsOf(streak, today),
    longest: streak.longest,
    stops: stops.slice(0, MAX_STOPS),
    stopsAvailable: stops.length,
  });
}

/** Mark today's round cleared and advance the streak. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return NextResponse.json({ error: "Sign in to practise." }, { status: 401 });

  const today = dayKey(new Date(), offsetFrom(req));
  const before = await readStreak(supabase, userId);
  const after = clearRound(before, today);

  const { error } = await supabase
    .from("practice_streak")
    .upsert({ ...streakToUpsert(userId, after), updated_at: new Date().toISOString() }, { onConflict: "user_id" });

  if (error) {
    console.error("practice_streak write failed", error);
    return NextResponse.json({ error: "Could not save your streak." }, { status: 500 });
  }

  return NextResponse.json({
    streak: streakAsOf(after, today),
    longest: after.longest,
    // A repeat clear on the same day must not read as a new day's progress.
    advanced: before.lastClearedOn !== today,
  });
}
