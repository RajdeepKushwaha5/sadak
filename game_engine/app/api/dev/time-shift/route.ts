import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dayKey } from "@/lib/game/streak";

export const runtime = "nodejs";

/**
 * Development only: pretend time has passed for the signed-in player.
 *
 * Retention is invisible on day one. Due phrases, the daily round and the
 * streak only exist once time has gone by, which makes them impossible to
 * demonstrate or test in a single sitting. This moves the player's own
 * review timestamps into the past instead of moving the clock.
 *
 * It is a simulation and must be presented as one. It never runs in
 * production: the route 404s unless NODE_ENV is "development".
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: { days?: number; streakDays?: number; tzOffset?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* defaults below */
  }
  const days = Math.max(1, Math.min(60, Math.round(body.days ?? 7)));
  const shiftMs = days * 86_400_000;

  const { data: rows, error } = await supabase
    .from("phrase_memory")
    .select("phrase_native, due_at, last_seen_at")
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const back = (iso: string | null) => (iso ? new Date(Date.parse(iso) - shiftMs).toISOString() : iso);
  for (const r of rows ?? []) {
    await supabase
      .from("phrase_memory")
      .update({ due_at: back(r.due_at), last_seen_at: back(r.last_seen_at) })
      .eq("user_id", userId)
      .eq("phrase_native", r.phrase_native);
  }

  // Optionally a streak of consecutive practice days ending yesterday, so the
  // round can be shown extending it. Also simulated.
  let streak: number | null = null;
  if (typeof body.streakDays === "number" && body.streakDays > 0) {
    streak = Math.min(60, Math.round(body.streakDays));
    const offset = Number.isFinite(body.tzOffset) ? (body.tzOffset as number) : 0;
    const yesterday = dayKey(new Date(Date.now() - 86_400_000), offset);
    await supabase.from("practice_streak").upsert(
      {
        user_id: userId,
        current_streak: streak,
        longest_streak: streak,
        last_cleared_on: yesterday,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }

  return NextResponse.json({ shiftedDays: days, phrases: rows?.length ?? 0, streak });
}
