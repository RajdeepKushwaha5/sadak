import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadDistrictById } from "@/lib/game/load-district";
import { dueNow, rowToMemory, type PhraseMemoryRow } from "@/lib/game/phrase-memory";
import { groupDueByTask, indexPhraseSites, type DueTask } from "@/lib/game/due";
import { retentionSignal, type RetentionSignal } from "@/lib/game/adaptive";

export const runtime = "nodejs";

type DueDistrict = {
  districtId: string;
  name: string;
  city: string;
  language: string;
  languageLabel: string;
  dueCount: number;
  tasks: DueTask[];
  unplaced: string[];
  /** Evidence for choosing lesson difficulty from recall, not errand order. */
  retention: RetentionSignal;
};

/**
 * What is due for this player, now, and where they can go to practise it.
 *
 * The daily round is a walk, not a deck: due phrases resolve to the NPCs who
 * teach them so the city itself becomes the review queue.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Sign in to see your review round." }, { status: 401 });
  }

  const only = new URL(req.url).searchParams.get("districtId")?.trim();

  let query = supabase.from("phrase_memory").select("*").eq("user_id", userId);
  if (only) query = query.eq("district_id", only);

  const { data, error } = await query;
  if (error) {
    console.error("phrase_memory read failed", error);
    return NextResponse.json({ error: "Could not load your review round." }, { status: 500 });
  }

  const all = (data ?? []).map((row) => rowToMemory(row as PhraseMemoryRow));
  if (all.length === 0) {
    return NextResponse.json({ dueCount: 0, districts: [] });
  }

  // Grouped over *all* history, not just what is due: a district where
  // everything is still held has no markers to draw but plenty to say about
  // how hard the next lesson should be.
  const byDistrict = new Map<string, typeof all>();
  for (const memory of all) {
    const bucket = byDistrict.get(memory.districtId);
    if (bucket) bucket.push(memory);
    else byDistrict.set(memory.districtId, [memory]);
  }

  const now = new Date();
  const districts: DueDistrict[] = [];
  let dueCount = 0;

  for (const [districtId, memories] of byDistrict) {
    const loaded = await loadDistrictById(districtId);
    if (!loaded) continue;

    const due = dueNow(memories, now);
    dueCount += due.length;

    const { tasks, unplaced } = groupDueByTask(due, indexPhraseSites(loaded.tasks));
    districts.push({
      districtId,
      name: loaded.district.name,
      city: loaded.district.city,
      language: loaded.district.language,
      languageLabel: loaded.district.languageLabel,
      dueCount: due.length,
      tasks,
      unplaced,
      retention: retentionSignal(memories, now),
    });
  }

  districts.sort((a, b) => b.dueCount - a.dueCount);

  return NextResponse.json({ dueCount, districts });
}
