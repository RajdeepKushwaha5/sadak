import type { PhraseMemory } from "@/lib/game/phrase-memory";
import type { PhraseSite } from "@/lib/game/due";

/**
 * Where a phrase stands, in the terms a learner (or a tutor) would use.
 *
 * Deliberately not the raw FSRS numbers: "stability 6.4, difficulty 5.1" is
 * a scheduler's vocabulary. What anyone actually wants to know is whether
 * they could say this tomorrow without looking.
 */
export type Standing = "held" | "fading" | "lost" | "new";

export type ReportPhrase = {
  native: string;
  roman: string;
  en: string;
  standing: Standing;
  /** Days the model expects recall to survive unprompted. */
  retainsDays: number | null;
  lapses: number;
  teacher: string;
};

export type DistrictReport = {
  districtId: string;
  name: string;
  city: string;
  languageLabel: string;
  counts: Record<Standing, number>;
  phrases: ReportPhrase[];
};

const HELD_DAYS = 7;

export function standingFor(memory: PhraseMemory, now: Date): Standing {
  if (memory.stability === null) return "new";
  const overdue = memory.dueAt !== null && new Date(memory.dueAt) <= now;
  // Overdue on a phrase that never held is a different problem from overdue
  // on one that did: the first needs re-teaching, the second a reminder.
  if (overdue) return memory.stability >= HELD_DAYS ? "fading" : "lost";
  return memory.stability >= HELD_DAYS ? "held" : "fading";
}

/**
 * Build the per-district breakdown, weakest first so the first thing on
 * screen is the thing worth doing something about.
 */
export function buildDistrictReport(
  meta: { districtId: string; name: string; city: string; languageLabel: string },
  memories: PhraseMemory[],
  sites: Map<string, PhraseSite>,
  now: Date = new Date(),
): DistrictReport {
  const counts: Record<Standing, number> = { held: 0, fading: 0, lost: 0, new: 0 };
  const order: Standing[] = ["lost", "fading", "held", "new"];

  const phrases: ReportPhrase[] = memories.map((m) => {
    const standing = standingFor(m, now);
    counts[standing] += 1;
    const site = sites.get(m.phraseNative);
    return {
      native: m.phraseNative,
      roman: site?.roman ?? m.phraseNative,
      en: site?.en ?? "",
      standing,
      retainsDays: m.stability === null ? null : Math.round(m.stability),
      lapses: m.lapses,
      teacher: site ? `${site.name} (${site.role})` : "—",
    };
  });

  phrases.sort(
    (a, b) =>
      order.indexOf(a.standing) - order.indexOf(b.standing) ||
      b.lapses - a.lapses ||
      (a.retainsDays ?? 0) - (b.retainsDays ?? 0),
  );

  return { ...meta, counts, phrases };
}
