import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadDistrictById } from "@/lib/game/load-district";
import { rowToMemory, type PhraseMemoryRow } from "@/lib/game/phrase-memory";
import { indexPhraseSites } from "@/lib/game/due";
import { buildDistrictReport, type DistrictReport } from "@/lib/game/report";

export const runtime = "nodejs";

/**
 * What the player can still say, and what has slipped.
 *
 * Finishing a district proves you got through it once. This is the artifact
 * that says whether any of it stuck — the question a tutor, a parent or the
 * learner themselves actually wants answered.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Sign in to see your progress." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("phrase_memory")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("phrase_memory read failed", error);
    return NextResponse.json({ error: "Could not load your progress." }, { status: 500 });
  }

  const all = (data ?? []).map((row) => rowToMemory(row as PhraseMemoryRow));
  if (all.length === 0) return NextResponse.json({ districts: [] });

  const byDistrict = new Map<string, typeof all>();
  for (const memory of all) {
    const bucket = byDistrict.get(memory.districtId);
    if (bucket) bucket.push(memory);
    else byDistrict.set(memory.districtId, [memory]);
  }

  const now = new Date();
  const districts: DistrictReport[] = [];

  for (const [districtId, memories] of byDistrict) {
    const loaded = await loadDistrictById(districtId);
    if (!loaded) continue;
    districts.push(
      buildDistrictReport(
        {
          districtId,
          name: loaded.district.name,
          city: loaded.district.city,
          languageLabel: loaded.district.languageLabel,
        },
        memories,
        indexPhraseSites(loaded.tasks),
        now,
      ),
    );
  }

  // Weakest district first, for the same reason phrases are ordered that way.
  districts.sort((a, b) => b.counts.lost + b.counts.fading - (a.counts.lost + a.counts.fading));

  return NextResponse.json({ districts });
}
